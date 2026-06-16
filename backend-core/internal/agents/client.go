package agents

import "context"

type QualifyLeadRequest struct {
	OrganizationID     string `json:"organization_id"`
	RegistryID         string `json:"registry_id"`
	ConversationID     string `json:"conversation_id"`
	PreviousResponseID string `json:"previous_response_id,omitempty"`
	Message            string `json:"message"`
}

type QualifyLeadResponse struct {
	ResponseID        string         `json:"response_id"`
	Summary           string         `json:"summary"`
	RecommendedAction string         `json:"recommended_action"`
	MemoryUpdates     map[string]any `json:"memory_updates"`
}

type Client interface {
	QualifyLead(ctx context.Context, input QualifyLeadRequest) (*QualifyLeadResponse, error)
}
