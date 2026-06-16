package services

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"vimob/backend-core/internal/domain"
	"vimob/backend-core/internal/integrations/whatsapp"
	"vimob/backend-core/internal/jobs"
	"vimob/backend-core/internal/repositories"
)

type Services struct {
	Organizations *OrganizationService
	Leads         *LeadService
	Events        *EventService
	Conversations *ConversationService
	Webhooks      *WebhookService
	Rules         *RuleService
	Scheduler     *SchedulerService
	Tasks         *TaskService
	Campaigns     *CampaignService
	Outbox        *OutboxService
	Memory        *MemoryService
}

type Options struct {
	AgentServiceEnabled bool
	WhatsAppGateway     whatsapp.Gateway
	LumiWebhookSecret   string
}

func New(repos *repositories.Repositories, jobRepo *jobs.Repository, opts ...Options) *Services {
	var options Options
	if len(opts) > 0 {
		options = opts[0]
	}
	if options.WhatsAppGateway == nil {
		options.WhatsAppGateway = whatsapp.NoopGateway{}
	}
	memory := &MemoryService{repos: repos}
	events := &EventService{repos: repos, jobs: jobRepo, memory: memory, agentEnabled: options.AgentServiceEnabled}
	conversations := &ConversationService{repos: repos, jobs: jobRepo, memory: memory}
	return &Services{
		Organizations: &OrganizationService{repos: repos},
		Leads:         &LeadService{repos: repos},
		Events:        events,
		Conversations: conversations,
		Webhooks:      &WebhookService{events: events, conversations: conversations, lumiSecret: options.LumiWebhookSecret},
		Rules:         &RuleService{repos: repos, jobs: jobRepo, memory: memory},
		Scheduler:     &SchedulerService{repos: repos, events: events},
		Tasks:         &TaskService{repos: repos},
		Campaigns:     &CampaignService{repos: repos, jobs: jobRepo},
		Outbox:        &OutboxService{repos: repos, whatsapp: options.WhatsAppGateway},
		Memory:        memory,
	}
}

type OrganizationService struct {
	repos *repositories.Repositories
}

func (s *OrganizationService) Create(ctx context.Context, name string) (*domain.Organization, error) {
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("name is required")
	}
	return s.repos.Organizations.Create(ctx, strings.TrimSpace(name))
}

func (s *OrganizationService) Get(ctx context.Context, id string) (*domain.Organization, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("organization id is required")
	}
	return s.repos.Organizations.Get(ctx, id)
}

type LeadService struct {
	repos *repositories.Repositories
}

type CreateLeadInput struct {
	OrganizationID string          `json:"organization_id"`
	CustomerID     string          `json:"customer_id"`
	Name           string          `json:"name"`
	Status         string          `json:"status"`
	Metadata       json.RawMessage `json:"metadata"`
}

func (s *LeadService) Create(ctx context.Context, input CreateLeadInput) (*domain.Lead, error) {
	if strings.TrimSpace(input.OrganizationID) == "" {
		return nil, errors.New("organization_id is required")
	}
	return s.repos.Leads.Create(ctx, repositories.CreateLeadInput{
		OrganizationID: input.OrganizationID,
		CustomerID:     input.CustomerID,
		Name:           input.Name,
		Status:         input.Status,
		Metadata:       input.Metadata,
	})
}

func (s *LeadService) Get(ctx context.Context, id string) (*domain.Lead, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("lead id is required")
	}
	return s.repos.Leads.Get(ctx, id)
}

type EventService struct {
	repos        *repositories.Repositories
	jobs         *jobs.Repository
	memory       *MemoryService
	agentEnabled bool
}

type CreateEventInput struct {
	OrganizationID string          `json:"organization_id"`
	Type           string          `json:"type"`
	RemoteJID      string          `json:"remote_jid"`
	RegistryID     string          `json:"registry_id"`
	CustomerName   string          `json:"customer_name"`
	Payload        json.RawMessage `json:"payload"`
}

func (s *EventService) Create(ctx context.Context, input CreateEventInput) (*domain.Event, error) {
	if input.OrganizationID == "" {
		return nil, errors.New("organization_id is required")
	}
	if input.Type == "" {
		return nil, errors.New("type is required")
	}
	registryID := NormalizeRegistryID(firstNonEmpty(input.RegistryID, input.RemoteJID))
	if registryID == "" && requiresRegistry(input.Type) {
		return nil, errors.New("remote_jid or registry_id is required")
	}

	if registryID != "" {
		if _, err := s.memory.EnsureCustomerContext(ctx, EnsureCustomerContextInput{
			OrganizationID: input.OrganizationID,
			RemoteJID:      firstNonEmpty(input.RemoteJID, registryID),
			RegistryID:     registryID,
			DisplayName:    input.CustomerName,
			Payload:        input.Payload,
		}); err != nil {
			return nil, err
		}
	}

	event, err := s.repos.Events.Insert(ctx, input.Type, input.OrganizationID, registryID, input.Payload)
	if err != nil {
		return nil, err
	}
	_, err = s.jobs.Enqueue(ctx, jobs.EnqueueInput{
		OrganizationID: input.OrganizationID,
		Type:           "event.process",
		RefID:          event.ID,
		Payload:        input.Payload,
	})
	if err != nil {
		return nil, err
	}
	return event, nil
}

type EventRoutingResult struct {
	EventID         string   `json:"event_id"`
	EventType       string   `json:"event_type"`
	RegistryID      string   `json:"registry_id,omitempty"`
	Enqueued        []string `json:"enqueued"`
	Skipped         []string `json:"skipped,omitempty"`
	OutboxMessageID string   `json:"outbox_message_id,omitempty"`
}

type routedEventPayload struct {
	EventID        string          `json:"event_id"`
	EventType      string          `json:"event_type"`
	RegistryID     string          `json:"registry_id,omitempty"`
	ConversationID string          `json:"conversation_id,omitempty"`
	Reason         string          `json:"reason"`
	Payload        json.RawMessage `json:"payload"`
}

type eventOutboxRequest struct {
	Channel   string          `json:"channel"`
	Recipient string          `json:"recipient"`
	Payload   json.RawMessage `json:"payload"`
}

func (s *EventService) Route(ctx context.Context, eventID string) (*EventRoutingResult, error) {
	if strings.TrimSpace(eventID) == "" {
		return nil, errors.New("event id is required")
	}
	event, err := s.repos.Events.Get(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event == nil {
		return nil, errors.New("event not found")
	}

	result := &EventRoutingResult{
		EventID:    event.ID,
		EventType:  event.Type,
		RegistryID: event.RegistryID,
	}

	state, err := s.memory.GetStateByRegistry(ctx, event.OrganizationID, event.RegistryID)
	if err != nil {
		return nil, err
	}
	conversationID := ""
	if state != nil {
		conversationID = state.ConversationID
	}
	routePayload := routedEventPayload{
		EventID:        event.ID,
		EventType:      event.Type,
		RegistryID:     event.RegistryID,
		ConversationID: conversationID,
		Reason:         "event.process",
		Payload:        event.Payload,
	}
	routeJSON, err := json.Marshal(routePayload)
	if err != nil {
		return nil, err
	}

	if err := s.enqueueRoute(ctx, event.OrganizationID, "rules.evaluate", event.ID, routeJSON, &result.Enqueued); err != nil {
		return nil, err
	}
	if state != nil && state.ConversationID != "" {
		if err := s.enqueueRoute(ctx, event.OrganizationID, "memory.prepare", state.ConversationID, event.Payload, &result.Enqueued); err != nil {
			return nil, err
		}
	} else if event.RegistryID != "" {
		result.Skipped = append(result.Skipped, "memory.prepare:no_active_conversation")
	}
	if shouldRouteToAgent(event.Type) {
		if s.agentEnabled {
			if err := s.enqueueRoute(ctx, event.OrganizationID, "agent.qualify", event.ID, routeJSON, &result.Enqueued); err != nil {
				return nil, err
			}
		} else {
			result.Skipped = append(result.Skipped, "agent.qualify:agent_service_not_configured")
		}
	}

	outboxRequest := parseOutboxRequest(event.Payload)
	if outboxRequest.Channel != "" && outboxRequest.Recipient != "" {
		outbox, err := s.repos.Outbox.Create(ctx, event.OrganizationID, outboxRequest.Channel, outboxRequest.Recipient, outboxRequest.Payload, time.Time{})
		if err != nil {
			return nil, err
		}
		result.OutboxMessageID = outbox.ID
		if err := s.enqueueRoute(ctx, event.OrganizationID, "outbox.send", outbox.ID, outbox.Payload, &result.Enqueued); err != nil {
			return nil, err
		}
	}

	return result, nil
}

func (s *EventService) enqueueRoute(ctx context.Context, organizationID string, jobType string, refID string, payload json.RawMessage, enqueued *[]string) error {
	if _, err := s.jobs.Enqueue(ctx, jobs.EnqueueInput{
		OrganizationID: organizationID,
		Type:           jobType,
		RefID:          refID,
		Payload:        payload,
	}); err != nil {
		return err
	}
	*enqueued = append(*enqueued, jobType)
	return nil
}

type ConversationService struct {
	repos  *repositories.Repositories
	jobs   *jobs.Repository
	memory *MemoryService
}

type IngestMessageInput struct {
	OrganizationID string          `json:"organization_id"`
	RemoteJID      string          `json:"remote_jid"`
	CustomerName   string          `json:"customer_name"`
	Content        string          `json:"content"`
	Payload        json.RawMessage `json:"payload"`
}

func (s *ConversationService) IngestMessage(ctx context.Context, input IngestMessageInput) (*domain.ConversationAIState, error) {
	state, err := s.memory.EnsureCustomerContext(ctx, EnsureCustomerContextInput{
		OrganizationID: input.OrganizationID,
		RemoteJID:      input.RemoteJID,
		DisplayName:    input.CustomerName,
		Payload:        input.Payload,
	})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Content) != "" || len(input.Payload) > 0 {
		if _, err := s.repos.Messages.Create(ctx, repositories.CreateConversationMessageInput{
			OrganizationID: state.OrganizationID,
			ConversationID: state.ConversationID,
			CustomerID:     state.CustomerID,
			Direction:      "inbound",
			Content:        input.Content,
			Payload:        input.Payload,
		}); err != nil {
			return nil, err
		}
	}
	_, err = s.jobs.Enqueue(ctx, jobs.EnqueueInput{
		OrganizationID: input.OrganizationID,
		Type:           "memory.prepare",
		RefID:          state.ConversationID,
		Payload:        input.Payload,
	})
	if err != nil {
		return nil, err
	}
	return state, nil
}

func (s *ConversationService) Restart(ctx context.Context, organizationID string, remoteJID string) error {
	return s.memory.RestartByRegistry(ctx, organizationID, NormalizeRegistryID(remoteJID))
}

type EnsureCustomerContextInput struct {
	OrganizationID string
	RemoteJID      string
	RegistryID     string
	DisplayName    string
	Payload        json.RawMessage
}

type MemoryService struct {
	repos *repositories.Repositories
}

type PreparedMemory struct {
	Source         string                 `json:"source"`
	OrganizationID string                 `json:"organization_id"`
	RegistryID     string                 `json:"registry_id"`
	ConversationID string                 `json:"conversation_id"`
	ContextVersion int                    `json:"context_version"`
	LastResponseID string                 `json:"last_response_id,omitempty"`
	MessageCount   int                    `json:"message_count"`
	RecentMessages []PreparedMessage      `json:"recent_messages"`
	Signals        map[string]interface{} `json:"signals"`
	PreparedAt     time.Time              `json:"prepared_at"`
}

type PreparedMessage struct {
	ID        string    `json:"id"`
	Direction string    `json:"direction"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *MemoryService) EnsureCustomerContext(ctx context.Context, input EnsureCustomerContextInput) (*domain.ConversationAIState, error) {
	if input.OrganizationID == "" {
		return nil, errors.New("organization_id is required")
	}
	registryID := NormalizeRegistryID(firstNonEmpty(input.RegistryID, input.RemoteJID))
	if registryID == "" {
		return nil, errors.New("remote_jid or registry_id is required")
	}
	customer, err := s.repos.Customers.UpsertByRegistry(ctx, repositories.UpsertCustomerInput{
		OrganizationID:     input.OrganizationID,
		RegistrySource:     "whatsapp",
		RegistryID:         registryID,
		RegistryIDOriginal: input.RemoteJID,
		DisplayName:        input.DisplayName,
		PhoneE164:          phoneFromRegistry(registryID),
		Metadata:           input.Payload,
	})
	if err != nil {
		return nil, err
	}
	conversation, err := s.repos.Conversations.EnsureActive(ctx, input.OrganizationID, customer.ID, registryID)
	if err != nil {
		return nil, err
	}
	return s.repos.Memory.EnsureState(ctx, input.OrganizationID, customer.ID, registryID, conversation.ID)
}

func (s *MemoryService) RestartByRegistry(ctx context.Context, organizationID string, registryID string) error {
	if organizationID == "" {
		return errors.New("organization_id is required")
	}
	if registryID == "" {
		return errors.New("registry_id is required")
	}
	return s.repos.Memory.RestartByRegistry(ctx, organizationID, registryID)
}

func (s *MemoryService) GetStateByRegistry(ctx context.Context, organizationID string, registryID string) (*domain.ConversationAIState, error) {
	if organizationID == "" || registryID == "" {
		return nil, nil
	}
	return s.repos.Memory.GetByRegistry(ctx, organizationID, registryID)
}

func (s *MemoryService) PrepareConversation(ctx context.Context, organizationID string, conversationID string) (*domain.ConversationAIState, error) {
	if organizationID == "" {
		return nil, errors.New("organization_id is required")
	}
	if conversationID == "" {
		return nil, errors.New("conversation_id is required")
	}

	state, err := s.repos.Memory.GetByConversation(ctx, organizationID, conversationID)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, errors.New("conversation memory state not found")
	}

	count, err := s.repos.Messages.CountByConversation(ctx, organizationID, conversationID)
	if err != nil {
		return nil, err
	}
	messages, err := s.repos.Messages.ListRecentByConversation(ctx, organizationID, conversationID, 20)
	if err != nil {
		return nil, err
	}

	preparedMessages := make([]PreparedMessage, 0, len(messages))
	for _, message := range messages {
		preparedMessages = append(preparedMessages, PreparedMessage{
			ID:        message.ID,
			Direction: message.Direction,
			Content:   strings.TrimSpace(message.Content),
			CreatedAt: message.CreatedAt,
		})
	}

	summary := buildConversationSummary(count, preparedMessages)
	memoryPayload := PreparedMemory{
		Source:         "conversation-memory-worker",
		OrganizationID: state.OrganizationID,
		RegistryID:     state.RegistryID,
		ConversationID: state.ConversationID,
		ContextVersion: state.ContextVersion,
		LastResponseID: state.LastResponseID,
		MessageCount:   count,
		RecentMessages: preparedMessages,
		Signals: map[string]interface{}{
			"has_openai_continuity": state.LastResponseID != "",
			"needs_agent_response":  len(preparedMessages) > 0,
			"last_direction":        lastDirection(preparedMessages),
		},
		PreparedAt: time.Now().UTC(),
	}
	memoryJSON, err := json.Marshal(memoryPayload)
	if err != nil {
		return nil, err
	}
	return s.repos.Memory.UpdatePrepared(ctx, state.ID, summary, memoryJSON)
}

type TaskService struct {
	repos *repositories.Repositories
}

func (s *TaskService) Create(ctx context.Context, organizationID string, title string, payload json.RawMessage) (*domain.Task, error) {
	if organizationID == "" || title == "" {
		return nil, errors.New("organization_id and title are required")
	}
	return s.repos.Tasks.Create(ctx, organizationID, title, payload)
}

type CampaignService struct {
	repos *repositories.Repositories
	jobs  *jobs.Repository
}

func (s *CampaignService) Create(ctx context.Context, organizationID string, name string, payload json.RawMessage) (*domain.Campaign, error) {
	if organizationID == "" || name == "" {
		return nil, errors.New("organization_id and name are required")
	}
	return s.repos.Campaigns.Create(ctx, organizationID, name, payload)
}

type OutboxService struct {
	repos    *repositories.Repositories
	whatsapp whatsapp.Gateway
}

func (s *OutboxService) Create(ctx context.Context, organizationID string, channel string, recipient string, payload json.RawMessage) (*domain.OutboxMessage, error) {
	if organizationID == "" || channel == "" || recipient == "" {
		return nil, errors.New("organization_id, channel and recipient are required")
	}
	return s.repos.Outbox.Create(ctx, organizationID, channel, recipient, payload, time.Time{})
}

type OutboxSendResult struct {
	MessageID         string `json:"message_id"`
	Channel           string `json:"channel"`
	Recipient         string `json:"recipient"`
	ProviderMessageID string `json:"provider_message_id,omitempty"`
	Status            string `json:"status"`
}

func (s *OutboxService) Send(ctx context.Context, outboxID string) (*OutboxSendResult, error) {
	if strings.TrimSpace(outboxID) == "" {
		return nil, errors.New("outbox id is required")
	}
	message, err := s.repos.Outbox.Get(ctx, outboxID)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return nil, errors.New("outbox message not found")
	}
	if message.Status == "sent" {
		return &OutboxSendResult{
			MessageID:         message.ID,
			Channel:           message.Channel,
			Recipient:         message.Recipient,
			ProviderMessageID: message.ProviderMessageID,
			Status:            message.Status,
		}, nil
	}

	if err := s.repos.Outbox.MarkProcessing(ctx, message.ID); err != nil {
		return nil, err
	}
	text, err := outboxText(message.Payload)
	if err != nil {
		_ = s.repos.Outbox.MarkFailed(ctx, message.ID, err)
		return nil, err
	}

	var providerMessageID string
	switch strings.ToLower(strings.TrimSpace(message.Channel)) {
	case "whatsapp", "wa":
		result, err := s.whatsapp.SendText(ctx, whatsapp.SendTextInput{
			OrganizationID: message.OrganizationID,
			RegistryID:     message.Recipient,
			Text:           text,
		})
		if err != nil {
			_ = s.repos.Outbox.MarkFailed(ctx, message.ID, err)
			return nil, err
		}
		providerMessageID = result.ProviderMessageID
	default:
		err := errors.New("unsupported outbox channel: " + message.Channel)
		_ = s.repos.Outbox.MarkFailed(ctx, message.ID, err)
		return nil, err
	}

	if err := s.repos.Outbox.MarkSent(ctx, message.ID, providerMessageID); err != nil {
		return nil, err
	}
	return &OutboxSendResult{
		MessageID:         message.ID,
		Channel:           message.Channel,
		Recipient:         message.Recipient,
		ProviderMessageID: providerMessageID,
		Status:            "sent",
	}, nil
}

func NormalizeRegistryID(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimSuffix(value, "@s.whatsapp.net")
	value = strings.TrimSuffix(value, "@c.us")
	value = strings.TrimSuffix(value, "@lid")
	value = strings.Split(value, ":")[0]
	re := regexp.MustCompile(`\D+`)
	return re.ReplaceAllString(value, "")
}

func phoneFromRegistry(registryID string) string {
	if registryID == "" {
		return ""
	}
	if strings.HasPrefix(registryID, "55") {
		return "+" + registryID
	}
	return registryID
}

func buildConversationSummary(messageCount int, messages []PreparedMessage) string {
	if messageCount == 0 {
		return "Sem mensagens registradas nesta conversa."
	}
	last := ""
	for i := len(messages) - 1; i >= 0; i-- {
		if strings.TrimSpace(messages[i].Content) != "" {
			last = strings.TrimSpace(messages[i].Content)
			break
		}
	}
	if last == "" {
		return "Conversa com mensagens registradas apenas em payload estruturado."
	}
	if len(last) > 180 {
		last = last[:180]
	}
	return "Ultima mensagem do cliente/contexto: " + last
}

func lastDirection(messages []PreparedMessage) string {
	if len(messages) == 0 {
		return ""
	}
	return messages[len(messages)-1].Direction
}

func shouldRouteToAgent(eventType string) bool {
	switch strings.TrimSpace(strings.ToLower(eventType)) {
	case "message.received",
		"conversation.message.received",
		"whatsapp.message.received",
		"lead.message.received",
		"lead.created",
		"lead.updated":
		return true
	default:
		return false
	}
}

func parseOutboxRequest(payload json.RawMessage) eventOutboxRequest {
	if len(payload) == 0 {
		return eventOutboxRequest{}
	}
	var envelope struct {
		Outbox        eventOutboxRequest `json:"outbox"`
		OutboxMessage eventOutboxRequest `json:"outbox_message"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return eventOutboxRequest{}
	}
	request := envelope.Outbox
	if request.Channel == "" && request.Recipient == "" {
		request = envelope.OutboxMessage
	}
	request.Channel = strings.TrimSpace(request.Channel)
	request.Recipient = strings.TrimSpace(request.Recipient)
	request.Payload = defaultRawJSON(request.Payload)
	return request
}

func outboxText(payload json.RawMessage) (string, error) {
	if len(payload) == 0 {
		return "", errors.New("outbox payload is required")
	}
	var data map[string]any
	if err := json.Unmarshal(payload, &data); err != nil {
		return "", err
	}
	for _, key := range []string{"text", "message", "body", "content"} {
		value, ok := data[key]
		if !ok {
			continue
		}
		text, ok := value.(string)
		if !ok {
			continue
		}
		text = strings.TrimSpace(text)
		if text != "" {
			return text, nil
		}
	}
	return "", errors.New("outbox text is required")
}

func defaultRawJSON(value json.RawMessage) json.RawMessage {
	if len(value) == 0 {
		return json.RawMessage(`{}`)
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func requiresRegistry(eventType string) bool {
	return strings.HasPrefix(eventType, "message.") ||
		strings.HasPrefix(eventType, "conversation.") ||
		strings.HasPrefix(eventType, "customer.") ||
		strings.HasPrefix(eventType, "lead.")
}
