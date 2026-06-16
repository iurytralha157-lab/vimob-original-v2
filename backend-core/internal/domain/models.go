package domain

import (
	"encoding/json"
	"time"
)

type Event struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	Type           string          `json:"type"`
	RegistryID     string          `json:"registry_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type Organization struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Lead struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	CustomerID     string    `json:"customer_id,omitempty"`
	Name           string    `json:"name"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Customer struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	RegistrySource string          `json:"registry_source"`
	RegistryID     string          `json:"registry_id"`
	DisplayName    string          `json:"display_name"`
	PhoneE164      string          `json:"phone_e164"`
	Metadata       json.RawMessage `json:"metadata"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type Conversation struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	CustomerID     string    `json:"customer_id"`
	RegistryID     string    `json:"registry_id"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type ConversationMessage struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	ConversationID string          `json:"conversation_id"`
	CustomerID     string          `json:"customer_id"`
	Direction      string          `json:"direction"`
	Content        string          `json:"content"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type ConversationAIState struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	CustomerID     string          `json:"customer_id"`
	RegistryID     string          `json:"registry_id"`
	ConversationID string          `json:"conversation_id"`
	Status         string          `json:"status"`
	LastResponseID string          `json:"last_response_id,omitempty"`
	ContextVersion int             `json:"context_version"`
	Summary        string          `json:"summary"`
	Memory         json.RawMessage `json:"memory"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type Task struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	LeadID         string          `json:"lead_id,omitempty"`
	CustomerID     string          `json:"customer_id,omitempty"`
	Title          string          `json:"title"`
	Status         string          `json:"status"`
	DueAt          *time.Time      `json:"due_at,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type Campaign struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	Name           string          `json:"name"`
	Status         string          `json:"status"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type OutboxMessage struct {
	ID                string          `json:"id"`
	OrganizationID    string          `json:"organization_id"`
	CampaignID        string          `json:"campaign_id,omitempty"`
	Channel           string          `json:"channel"`
	Recipient         string          `json:"recipient"`
	Payload           json.RawMessage `json:"payload"`
	Status            string          `json:"status"`
	Attempts          int             `json:"attempts"`
	MaxAttempts       int             `json:"max_attempts"`
	ProviderMessageID string          `json:"provider_message_id,omitempty"`
	LastError         string          `json:"last_error,omitempty"`
	ScheduledAt       time.Time       `json:"scheduled_at"`
	SentAt            *time.Time      `json:"sent_at,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}

type RuleOccurrence struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	RuleKey        string          `json:"rule_key"`
	RegistryID     string          `json:"registry_id,omitempty"`
	OccurrenceKey  string          `json:"occurrence_key"`
	RefID          string          `json:"ref_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type NoReplyCandidate struct {
	OrganizationID string    `json:"organization_id"`
	RegistryID     string    `json:"registry_id"`
	ConversationID string    `json:"conversation_id"`
	CustomerID     string    `json:"customer_id"`
	LastActivityAt time.Time `json:"last_activity_at"`
	DaysInactive   int       `json:"days_inactive"`
}

type StoppedBuyingCandidate struct {
	OrganizationID string    `json:"organization_id"`
	RegistryID     string    `json:"registry_id"`
	LastPurchaseAt time.Time `json:"last_purchase_at"`
	DaysInactive   int       `json:"days_inactive"`
}
