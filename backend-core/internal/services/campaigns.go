package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"vimob/backend-core/internal/domain"
	"vimob/backend-core/internal/jobs"
	"vimob/backend-core/internal/repositories"
)

type CampaignExpandResult struct {
	CampaignID     string   `json:"campaign_id"`
	CreatedOutbox  int      `json:"created_outbox"`
	ExistingOutbox int      `json:"existing_outbox"`
	EnqueuedJobs   int      `json:"enqueued_jobs"`
	Skipped        []string `json:"skipped,omitempty"`
}

type campaignRecipient struct {
	Channel   string
	Recipient string
	Payload   json.RawMessage
}

func (s *CampaignService) Expand(ctx context.Context, campaignID string) (*CampaignExpandResult, error) {
	if strings.TrimSpace(campaignID) == "" {
		return nil, errors.New("campaign id is required")
	}
	campaign, err := s.repos.Campaigns.Get(ctx, campaignID)
	if err != nil {
		return nil, err
	}
	if campaign == nil {
		return nil, errors.New("campaign not found")
	}

	recipients, err := campaignRecipients(campaign)
	if err != nil {
		return nil, err
	}
	result := &CampaignExpandResult{CampaignID: campaign.ID}
	for _, recipient := range recipients {
		outbox, created, err := s.repos.Outbox.CreateForCampaignOnce(ctx, repositories.CreateOutboxForCampaignInput{
			OrganizationID: campaign.OrganizationID,
			CampaignID:     campaign.ID,
			Channel:        recipient.Channel,
			Recipient:      recipient.Recipient,
			Payload:        recipient.Payload,
			ScheduledAt:    time.Time{},
		})
		if err != nil {
			return nil, err
		}
		if outbox == nil {
			result.Skipped = append(result.Skipped, recipient.Recipient+":outbox_not_created")
			continue
		}
		if created {
			result.CreatedOutbox++
		} else {
			result.ExistingOutbox++
		}
		if outbox.Status == "pending" || outbox.Status == "failed" {
			if _, err := s.jobs.Enqueue(ctx, jobs.EnqueueInput{
				OrganizationID: campaign.OrganizationID,
				Type:           "outbox.send",
				RefID:          outbox.ID,
				Payload:        outbox.Payload,
				Priority:       6,
			}); err != nil {
				return nil, err
			}
			result.EnqueuedJobs++
		} else {
			result.Skipped = append(result.Skipped, recipient.Recipient+":outbox_"+outbox.Status)
		}
	}
	if result.CreatedOutbox > 0 || result.EnqueuedJobs > 0 {
		if err := s.repos.Campaigns.UpdateStatus(ctx, campaign.ID, "expanded"); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func campaignRecipients(campaign *domain.Campaign) ([]campaignRecipient, error) {
	var data map[string]any
	if len(campaign.Payload) > 0 {
		if err := json.Unmarshal(campaign.Payload, &data); err != nil {
			return nil, err
		}
	}
	if data == nil {
		data = map[string]any{}
	}

	channel := stringFromMap(data, "channel")
	if channel == "" {
		channel = "whatsapp"
	}
	text := campaignText(data)
	basePayload := map[string]any{
		"campaign_id":   campaign.ID,
		"campaign_name": campaign.Name,
		"text":          text,
	}
	for _, key := range []string{"rule", "event_id", "event_type", "customer_id", "conversation_id"} {
		if value, ok := data[key]; ok {
			basePayload[key] = value
		}
	}

	var recipients []campaignRecipient
	if rawRecipients, ok := data["recipients"].([]any); ok {
		for _, raw := range rawRecipients {
			recipient, ok := campaignRecipientFromAny(raw, channel, basePayload)
			if ok {
				recipients = append(recipients, recipient)
			}
		}
	}

	if len(recipients) == 0 {
		recipient := firstNonEmpty(
			stringFromMap(data, "recipient"),
			stringFromMap(data, "registry_id"),
			stringFromMap(data, "remote_jid"),
		)
		recipient = NormalizeRegistryID(recipient)
		if recipient != "" {
			payload, err := json.Marshal(basePayload)
			if err != nil {
				return nil, err
			}
			recipients = append(recipients, campaignRecipient{
				Channel:   channel,
				Recipient: recipient,
				Payload:   payload,
			})
		}
	}
	if len(recipients) == 0 {
		return nil, errors.New("campaign has no recipients")
	}
	return recipients, nil
}

func campaignRecipientFromAny(raw any, fallbackChannel string, basePayload map[string]any) (campaignRecipient, bool) {
	switch typed := raw.(type) {
	case string:
		recipient := NormalizeRegistryID(typed)
		if recipient == "" {
			return campaignRecipient{}, false
		}
		payload, err := json.Marshal(basePayload)
		if err != nil {
			return campaignRecipient{}, false
		}
		return campaignRecipient{Channel: fallbackChannel, Recipient: recipient, Payload: payload}, true
	case map[string]any:
		channel := stringFromMap(typed, "channel")
		if channel == "" {
			channel = fallbackChannel
		}
		recipient := NormalizeRegistryID(firstNonEmpty(
			stringFromMap(typed, "recipient"),
			stringFromMap(typed, "registry_id"),
			stringFromMap(typed, "remote_jid"),
		))
		if recipient == "" {
			return campaignRecipient{}, false
		}
		payloadMap := cloneMap(basePayload)
		if text := campaignText(typed); text != "" {
			payloadMap["text"] = text
		}
		payload, err := json.Marshal(payloadMap)
		if err != nil {
			return campaignRecipient{}, false
		}
		return campaignRecipient{Channel: channel, Recipient: recipient, Payload: payload}, true
	default:
		return campaignRecipient{}, false
	}
}

func campaignText(data map[string]any) string {
	for _, key := range []string{"text", "message", "body", "content"} {
		value := stringFromMap(data, key)
		if value != "" {
			return value
		}
	}
	return "Sentimos sua falta. Posso te ajudar com uma nova oportunidade?"
}

func stringFromMap(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func cloneMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
