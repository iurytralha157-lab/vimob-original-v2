package workers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"vimob/backend-core/internal/jobs"
	"vimob/backend-core/internal/services"
)

type FactoryConfig struct {
	WorkerID     string
	BatchSize    int
	PollInterval time.Duration
}

func NewEventWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("event-worker", cfg.WorkerID, []string{"event.process"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		result, err := svc.Events.Route(ctx, job.RefID)
		if err != nil {
			return err
		}
		logger.Info(
			"event routed",
			"job_id", job.ID,
			"event_id", result.EventID,
			"event_type", result.EventType,
			"organization_id", job.OrganizationID,
			"enqueued", result.Enqueued,
			"skipped", result.Skipped,
		)
		return nil
	})
}

func NewRuleWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("rule-worker", cfg.WorkerID, []string{"rules.evaluate"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		result, err := svc.Rules.Evaluate(ctx, job.OrganizationID, job.Payload)
		if err != nil {
			return err
		}
		logger.Info(
			"rules evaluated",
			"job_id", job.ID,
			"event_id", result.EventID,
			"event_type", result.EventType,
			"actions", result.Actions,
			"skipped", result.Skipped,
		)
		return nil
	})
}

func NewSchedulerWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return &SchedulerWorker{cfg: cfg, jobs: repo, scheduler: svc.Scheduler, logger: logger}
}

type SchedulerWorker struct {
	cfg       FactoryConfig
	jobs      *jobs.Repository
	scheduler *services.SchedulerService
	logger    *slog.Logger
}

func (w *SchedulerWorker) Name() string {
	return "scheduler-worker"
}

func (w *SchedulerWorker) Start(ctx context.Context) error {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		result, err := w.scheduler.RunDueRules(ctx, time.Now().UTC())
		if err != nil {
			w.logger.Error("scheduler run failed", "error", err)
		} else {
			w.logger.Info(
				"scheduler run completed",
				"no_reply_created", result.NoReplyCreated,
				"stopped_buying_created", result.StoppedBuyingCreated,
				"skipped", result.Skipped,
			)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func NewMemoryWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("conversation-memory-worker", cfg.WorkerID, []string{"memory.prepare", "memory.restart"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		if job.Type == "memory.restart" {
			var payload struct {
				RegistryID string `json:"registry_id"`
				RemoteJID  string `json:"remote_jid"`
			}
			_ = json.Unmarshal(job.Payload, &payload)
			registryID := services.NormalizeRegistryID(firstNonEmpty(payload.RegistryID, payload.RemoteJID))
			return svc.Memory.RestartByRegistry(ctx, job.OrganizationID, registryID)
		}
		state, err := svc.Memory.PrepareConversation(ctx, job.OrganizationID, job.RefID)
		if err != nil {
			return err
		}
		logger.Info(
			"memory prepared",
			"job_id", job.ID,
			"organization_id", job.OrganizationID,
			"registry_id", state.RegistryID,
			"context_version", state.ContextVersion,
			"has_last_response_id", state.LastResponseID != "",
		)
		return nil
	})
}

func NewAgentWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("agent-worker", cfg.WorkerID, []string{"agent.qualify", "agent.summarize"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		return errors.New("agent service is not configured in this phase")
	})
}

func NewOutboxWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("outbox-worker", cfg.WorkerID, []string{"outbox.send"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		result, err := svc.Outbox.Send(ctx, job.RefID)
		if err != nil {
			return err
		}
		logger.Info(
			"outbox message sent",
			"job_id", job.ID,
			"message_id", result.MessageID,
			"channel", result.Channel,
			"recipient", result.Recipient,
			"provider_message_id", result.ProviderMessageID,
		)
		return nil
	})
}

func NewCampaignWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("campaign-worker", cfg.WorkerID, []string{"campaign.expand", "campaign.dispatch"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		result, err := svc.Campaigns.Expand(ctx, job.RefID)
		if err != nil {
			return err
		}
		logger.Info(
			"campaign expanded",
			"job_id", job.ID,
			"job_type", job.Type,
			"campaign_id", result.CampaignID,
			"created_outbox", result.CreatedOutbox,
			"existing_outbox", result.ExistingOutbox,
			"enqueued_jobs", result.EnqueuedJobs,
			"skipped", result.Skipped,
		)
		return nil
	})
}

func NewNotificationWorker(cfg FactoryConfig, repo *jobs.Repository, svc *services.Services, logger *slog.Logger) Worker {
	return NewPollingWorker("notification-worker", cfg.WorkerID, []string{"notification.dispatch"}, cfg.BatchSize, cfg.PollInterval, repo, logger, func(ctx context.Context, job jobs.Job) error {
		logger.Info("notification job placeholder", "job_id", job.ID)
		return nil
	})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
