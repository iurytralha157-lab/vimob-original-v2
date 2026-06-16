package services

import (
	"context"
	"encoding/json"
	"time"

	"vimob/backend-core/internal/domain"
	"vimob/backend-core/internal/repositories"
)

const (
	defaultNoReplyDays       = 7
	defaultStoppedBuyingDays = 30
	defaultSchedulerBatch    = 50
)

type SchedulerService struct {
	repos  *repositories.Repositories
	events *EventService
}

type SchedulerRunResult struct {
	NoReplyCreated       int      `json:"no_reply_created"`
	StoppedBuyingCreated int      `json:"stopped_buying_created"`
	Skipped              []string `json:"skipped,omitempty"`
}

func (s *SchedulerService) RunDueRules(ctx context.Context, now time.Time) (*SchedulerRunResult, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	result := &SchedulerRunResult{}

	noReplyCutoff := now.AddDate(0, 0, -defaultNoReplyDays)
	noReplyCandidates, err := s.repos.Scheduler.ListNoReplyCandidates(ctx, noReplyCutoff, defaultSchedulerBatch)
	if err != nil {
		return nil, err
	}
	for _, candidate := range noReplyCandidates {
		created, err := s.createNoReplyEvent(ctx, candidate)
		if err != nil {
			return nil, err
		}
		if created {
			result.NoReplyCreated++
		} else {
			result.Skipped = append(result.Skipped, "no_reply_7_days:"+candidate.RegistryID)
		}
	}

	stoppedBuyingCutoff := now.AddDate(0, 0, -defaultStoppedBuyingDays)
	stoppedBuyingCandidates, err := s.repos.Scheduler.ListStoppedBuyingCandidates(ctx, stoppedBuyingCutoff, defaultSchedulerBatch)
	if err != nil {
		return nil, err
	}
	for _, candidate := range stoppedBuyingCandidates {
		created, err := s.createStoppedBuyingEvent(ctx, candidate)
		if err != nil {
			return nil, err
		}
		if created {
			result.StoppedBuyingCreated++
		} else {
			result.Skipped = append(result.Skipped, "customer_stopped_buying:"+candidate.RegistryID)
		}
	}

	return result, nil
}

func (s *SchedulerService) createNoReplyEvent(ctx context.Context, candidate domain.NoReplyCandidate) (bool, error) {
	payload, err := json.Marshal(map[string]any{
		"source":                "scheduler-worker",
		"rule":                  "no_reply_7_days",
		"registry_id":           candidate.RegistryID,
		"conversation_id":       candidate.ConversationID,
		"customer_id":           candidate.CustomerID,
		"days_without_response": candidate.DaysInactive,
		"last_activity_at":      candidate.LastActivityAt,
	})
	if err != nil {
		return false, err
	}
	occurrenceKey := candidate.LastActivityAt.UTC().Format("2006-01-02")
	occurrence, created, err := s.repos.Occurrences.CreateOnce(ctx, repositories.CreateRuleOccurrenceInput{
		OrganizationID: candidate.OrganizationID,
		RuleKey:        "no_reply_7_days",
		RegistryID:     candidate.RegistryID,
		OccurrenceKey:  occurrenceKey,
		RefID:          candidate.ConversationID,
		Payload:        payload,
	})
	if err != nil || !created {
		return created, err
	}
	if _, err := s.events.Create(ctx, CreateEventInput{
		OrganizationID: candidate.OrganizationID,
		Type:           "conversation.no_reply_7d",
		RegistryID:     candidate.RegistryID,
		Payload:        payload,
	}); err != nil {
		_ = s.repos.Occurrences.Delete(ctx, occurrence.ID)
		return false, err
	}
	return true, nil
}

func (s *SchedulerService) createStoppedBuyingEvent(ctx context.Context, candidate domain.StoppedBuyingCandidate) (bool, error) {
	payload, err := json.Marshal(map[string]any{
		"source":                   "scheduler-worker",
		"rule":                     "customer_stopped_buying",
		"registry_id":              candidate.RegistryID,
		"days_since_last_purchase": candidate.DaysInactive,
		"last_purchase_at":         candidate.LastPurchaseAt,
	})
	if err != nil {
		return false, err
	}
	occurrenceKey := candidate.LastPurchaseAt.UTC().Format("2006-01-02")
	occurrence, created, err := s.repos.Occurrences.CreateOnce(ctx, repositories.CreateRuleOccurrenceInput{
		OrganizationID: candidate.OrganizationID,
		RuleKey:        "customer_stopped_buying",
		RegistryID:     candidate.RegistryID,
		OccurrenceKey:  occurrenceKey,
		Payload:        payload,
	})
	if err != nil || !created {
		return created, err
	}
	if _, err := s.events.Create(ctx, CreateEventInput{
		OrganizationID: candidate.OrganizationID,
		Type:           "customer.purchase_stopped",
		RegistryID:     candidate.RegistryID,
		Payload:        payload,
	}); err != nil {
		_ = s.repos.Occurrences.Delete(ctx, occurrence.ID)
		return false, err
	}
	return true, nil
}
