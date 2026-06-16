package services

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"vimob/backend-core/internal/domain"
	"vimob/backend-core/internal/jobs"
	"vimob/backend-core/internal/repositories"
)

type RuleService struct {
	repos  *repositories.Repositories
	jobs   *jobs.Repository
	memory *MemoryService
}

type RuleEvaluationResult struct {
	EventID    string       `json:"event_id"`
	EventType  string       `json:"event_type"`
	RegistryID string       `json:"registry_id,omitempty"`
	Actions    []RuleAction `json:"actions"`
	Skipped    []string     `json:"skipped,omitempty"`
}

type RuleAction struct {
	Rule  string `json:"rule"`
	Type  string `json:"type"`
	RefID string `json:"ref_id,omitempty"`
	Title string `json:"title,omitempty"`
}

type ruleEventPayload struct {
	EventID        string          `json:"event_id"`
	EventType      string          `json:"event_type"`
	RegistryID     string          `json:"registry_id,omitempty"`
	ConversationID string          `json:"conversation_id,omitempty"`
	Reason         string          `json:"reason"`
	Payload        json.RawMessage `json:"payload"`
}

func (s *RuleService) Evaluate(ctx context.Context, organizationID string, payload json.RawMessage) (*RuleEvaluationResult, error) {
	var input ruleEventPayload
	if err := json.Unmarshal(payload, &input); err != nil {
		return nil, err
	}
	result := &RuleEvaluationResult{
		EventID:    input.EventID,
		EventType:  input.EventType,
		RegistryID: input.RegistryID,
	}

	state, err := s.memory.GetStateByRegistry(ctx, organizationID, input.RegistryID)
	if err != nil {
		return nil, err
	}
	customerID := ""
	if state != nil {
		customerID = state.CustomerID
	}

	if matchesNoReply7Days(input) {
		task, err := s.createRuleTask(ctx, organizationID, customerID, "Cliente ficou 7 dias sem resposta", "no_reply_7_days", input, time.Now().UTC().Add(1*time.Hour))
		if err != nil {
			return nil, err
		}
		result.Actions = append(result.Actions, RuleAction{Rule: "no_reply_7_days", Type: "task.created", RefID: task.ID, Title: task.Title})
	}

	if matchesProposalOpened3Times(input) {
		title := "Cliente abriu proposta 3 vezes - acionar vendedor"
		task, err := s.createRuleTask(ctx, organizationID, customerID, title, "proposal_opened_3_times", input, time.Now().UTC().Add(30*time.Minute))
		if err != nil {
			return nil, err
		}
		result.Actions = append(result.Actions, RuleAction{Rule: "proposal_opened_3_times", Type: "task.created", RefID: task.ID, Title: task.Title})

		alertPayload, err := ruleActionPayload("proposal_opened_3_times", input, map[string]any{
			"task_id": task.ID,
			"title":   title,
		})
		if err != nil {
			return nil, err
		}
		alertJob, err := s.jobs.Enqueue(ctx, jobs.EnqueueInput{
			OrganizationID: organizationID,
			Type:           "notification.dispatch",
			RefID:          task.ID,
			Payload:        alertPayload,
			Priority:       8,
		})
		if err != nil {
			return nil, err
		}
		result.Actions = append(result.Actions, RuleAction{Rule: "proposal_opened_3_times", Type: "notification.enqueued", RefID: alertJob.ID, Title: "Alerta vendedor"})
	}

	if matchesStoppedBuying(input) {
		campaignPayload, err := ruleActionPayload("customer_stopped_buying", input, map[string]any{
			"registry_id": input.RegistryID,
			"customer_id": customerID,
		})
		if err != nil {
			return nil, err
		}
		campaign, err := s.repos.Campaigns.Create(ctx, organizationID, "Reativacao de cliente parado", campaignPayload)
		if err != nil {
			return nil, err
		}
		result.Actions = append(result.Actions, RuleAction{Rule: "customer_stopped_buying", Type: "campaign.created", RefID: campaign.ID, Title: campaign.Name})

		campaignJob, err := s.jobs.Enqueue(ctx, jobs.EnqueueInput{
			OrganizationID: organizationID,
			Type:           "campaign.expand",
			RefID:          campaign.ID,
			Payload:        campaignPayload,
			Priority:       7,
		})
		if err != nil {
			return nil, err
		}
		result.Actions = append(result.Actions, RuleAction{Rule: "customer_stopped_buying", Type: "campaign.enqueued", RefID: campaignJob.ID, Title: "Disparar campanha"})
	}

	if len(result.Actions) == 0 {
		result.Skipped = append(result.Skipped, "no_rule_matched")
	}
	return result, nil
}

func (s *RuleService) createRuleTask(ctx context.Context, organizationID string, customerID string, title string, rule string, input ruleEventPayload, dueAt time.Time) (*domain.Task, error) {
	payload, err := ruleActionPayload(rule, input, map[string]any{
		"registry_id": input.RegistryID,
		"customer_id": customerID,
	})
	if err != nil {
		return nil, err
	}
	return s.repos.Tasks.CreateDetailed(ctx, repositories.CreateTaskDetailedInput{
		OrganizationID: organizationID,
		CustomerID:     customerID,
		Title:          title,
		DueAt:          dueAt,
		Payload:        payload,
	})
}

func matchesNoReply7Days(input ruleEventPayload) bool {
	eventType := normalizeEventType(input.EventType)
	if eventType == "conversation.no_reply_7d" ||
		eventType == "customer.no_reply_7d" ||
		eventType == "lead.no_reply_7d" {
		return true
	}
	return payloadInt(input.Payload, "days_without_response", "no_reply_days", "days_since_last_response") >= 7
}

func matchesProposalOpened3Times(input ruleEventPayload) bool {
	eventType := normalizeEventType(input.EventType)
	if eventType == "proposal.opened_3_times" || eventType == "proposal.opened.three_times" {
		return true
	}
	if eventType != "proposal.opened" && eventType != "proposal.viewed" {
		return false
	}
	return payloadInt(input.Payload, "open_count", "proposal_open_count", "view_count", "proposal_view_count") >= 3
}

func matchesStoppedBuying(input ruleEventPayload) bool {
	eventType := normalizeEventType(input.EventType)
	if eventType == "customer.purchase_stopped" ||
		eventType == "customer.stopped_buying" ||
		eventType == "purchase.stopped" {
		return true
	}
	if payloadBool(input.Payload, "stopped_buying", "purchase_stopped") {
		return true
	}
	return payloadInt(input.Payload, "days_since_last_purchase", "days_without_purchase") >= 30
}

func normalizeEventType(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func payloadInt(payload json.RawMessage, keys ...string) int {
	if len(payload) == 0 {
		return 0
	}
	var data map[string]any
	if err := json.Unmarshal(payload, &data); err != nil {
		return 0
	}
	for _, key := range keys {
		value, ok := data[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case float64:
			return int(typed)
		case string:
			parsed, err := strconv.Atoi(strings.TrimSpace(typed))
			if err == nil {
				return parsed
			}
		}
	}
	return 0
}

func payloadBool(payload json.RawMessage, keys ...string) bool {
	if len(payload) == 0 {
		return false
	}
	var data map[string]any
	if err := json.Unmarshal(payload, &data); err != nil {
		return false
	}
	for _, key := range keys {
		value, ok := data[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case bool:
			return typed
		case string:
			normalized := strings.TrimSpace(strings.ToLower(typed))
			return normalized == "true" || normalized == "1" || normalized == "yes" || normalized == "sim"
		}
	}
	return false
}

func ruleActionPayload(rule string, input ruleEventPayload, extra map[string]any) (json.RawMessage, error) {
	payload := map[string]any{
		"rule":            rule,
		"event_id":        input.EventID,
		"event_type":      input.EventType,
		"registry_id":     input.RegistryID,
		"conversation_id": input.ConversationID,
		"source_payload":  json.RawMessage(defaultRawJSON(input.Payload)),
	}
	for key, value := range extra {
		if text, ok := value.(string); ok && text == "" {
			continue
		}
		payload[key] = value
	}
	return json.Marshal(payload)
}
