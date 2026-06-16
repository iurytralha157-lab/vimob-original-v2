package services

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"strings"
)

type WebhookService struct {
	events        *EventService
	conversations *ConversationService
	lumiSecret    string
}

type LumiWebhookResult struct {
	Accepted       bool   `json:"accepted"`
	Event          string `json:"event"`
	RegistryID     string `json:"registry_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	EventID        string `json:"event_id,omitempty"`
	SkippedReason  string `json:"skipped_reason,omitempty"`
}

func (s *WebhookService) AuthorizeLumi(candidates ...string) bool {
	expected := strings.TrimSpace(s.lumiSecret)
	if expected == "" {
		return true
	}
	for _, candidate := range candidates {
		candidate = normalizeWebhookSecret(candidate)
		if candidate == "" {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(expected)) == 1 {
			return true
		}
	}
	return false
}

func (s *WebhookService) HandleLumi(ctx context.Context, organizationID string, payload json.RawMessage) (*LumiWebhookResult, error) {
	if strings.TrimSpace(organizationID) == "" {
		return nil, errors.New("organization_id is required")
	}
	if len(payload) == 0 {
		return nil, errors.New("payload is required")
	}

	var root map[string]any
	if err := json.Unmarshal(payload, &root); err != nil {
		return nil, err
	}
	eventName := firstNonEmpty(
		stringPath(root, "event"),
		stringPath(root, "type"),
		stringPath(root, "body.event"),
		stringPath(root, "body.type"),
	)
	if eventName == "" {
		eventName = "MESSAGES_UPSERT"
	}
	result := &LumiWebhookResult{Accepted: true, Event: eventName}
	if !isLumiMessageEvent(eventName) {
		result.SkippedReason = "unsupported_event"
		return result, nil
	}

	remoteJID := firstNonEmpty(
		stringPath(root, "body.data.reply_to_number"),
		stringPath(root, "data.reply_to_number"),
		stringPath(root, "body.data.reply_to_jid"),
		stringPath(root, "data.reply_to_jid"),
		stringPath(root, "body.data.sender_jid"),
		stringPath(root, "data.sender_jid"),
		stringPath(root, "body.data.from_jid"),
		stringPath(root, "data.from_jid"),
		stringPath(root, "body.data.chat"),
		stringPath(root, "data.chat"),
	)
	if remoteJID == "" {
		result.SkippedReason = "missing_remote_jid"
		return result, nil
	}
	registryID := NormalizeRegistryID(remoteJID)
	if registryID == "" {
		result.SkippedReason = "invalid_remote_jid"
		return result, nil
	}
	result.RegistryID = registryID

	if boolPath(root, "body.data.from_me") || boolPath(root, "data.from_me") || boolPath(root, "body.data.key.from_me") || boolPath(root, "data.key.from_me") {
		result.SkippedReason = "from_me"
		return result, nil
	}

	content := firstNonEmpty(
		stringPath(root, "body.data.content.text"),
		stringPath(root, "data.content.text"),
		stringPath(root, "body.data.text"),
		stringPath(root, "data.text"),
		stringPath(root, "body.data.message.text"),
		stringPath(root, "data.message.text"),
		stringPath(root, "body.data.content.caption"),
		stringPath(root, "data.content.caption"),
	)
	customerName := firstNonEmpty(
		stringPath(root, "body.data.push_name"),
		stringPath(root, "data.push_name"),
		stringPath(root, "body.data.contact.name"),
		stringPath(root, "data.contact.name"),
		stringPath(root, "body.data.name"),
		stringPath(root, "data.name"),
	)

	state, err := s.conversations.IngestMessage(ctx, IngestMessageInput{
		OrganizationID: organizationID,
		RemoteJID:      remoteJID,
		CustomerName:   customerName,
		Content:        content,
		Payload:        payload,
	})
	if err != nil {
		return nil, err
	}
	result.ConversationID = state.ConversationID

	event, err := s.events.Create(ctx, CreateEventInput{
		OrganizationID: organizationID,
		Type:           "message.received",
		RemoteJID:      remoteJID,
		RegistryID:     registryID,
		CustomerName:   customerName,
		Payload:        payload,
	})
	if err != nil {
		return nil, err
	}
	result.EventID = event.ID
	return result, nil
}

func normalizeWebhookSecret(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		value = strings.TrimSpace(value[7:])
	}
	return value
}

func isLumiMessageEvent(eventName string) bool {
	normalized := strings.TrimSpace(strings.ToUpper(eventName))
	return normalized == "MESSAGES_UPSERT" ||
		normalized == "MESSAGE_RECEIVED" ||
		normalized == "MESSAGES.UPDATE" ||
		normalized == "MESSAGES_UPSERTED"
}

func stringPath(root map[string]any, path string) string {
	value, ok := valuePath(root, path)
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func boolPath(root map[string]any, path string) bool {
	value, ok := valuePath(root, path)
	if !ok {
		return false
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		normalized := strings.TrimSpace(strings.ToLower(typed))
		return normalized == "true" || normalized == "1" || normalized == "yes" || normalized == "sim"
	default:
		return false
	}
}

func valuePath(root map[string]any, path string) (any, bool) {
	var current any = root
	for _, part := range strings.Split(path, ".") {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}
