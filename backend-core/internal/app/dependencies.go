package app

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"vimob/backend-core/internal/config"
	"vimob/backend-core/internal/controllers"
	"vimob/backend-core/internal/database"
	"vimob/backend-core/internal/httpapi"
	"vimob/backend-core/internal/integrations/whatsapp"
	"vimob/backend-core/internal/jobs"
	"vimob/backend-core/internal/repositories"
	"vimob/backend-core/internal/services"
	"vimob/backend-core/internal/workers"
)

type Dependencies struct {
	Config      config.Config
	Logger      *slog.Logger
	DB          *database.DB
	Jobs        *jobs.Repository
	Repos       *repositories.Repositories
	Services    *services.Services
	Controllers *controllers.Controllers
}

func Build(ctx context.Context) (*Dependencies, error) {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	jobRepo := jobs.NewRepository(db.Pool)
	repos := repositories.New(db.Pool)
	whatsGateway := whatsapp.Gateway(whatsapp.NoopGateway{})
	if cfg.LumiInstanceKey != "" {
		whatsGateway = whatsapp.NewLumiGateway(cfg.LumiBaseURL, cfg.LumiInstanceKey)
	}
	svc := services.New(repos, jobRepo, services.Options{
		AgentServiceEnabled: cfg.AgentServiceURL != "",
		WhatsAppGateway:     whatsGateway,
		LumiWebhookSecret:   cfg.LumiWebhookSecret,
	})
	ctrl := controllers.New(svc)
	return &Dependencies{
		Config:      cfg,
		Logger:      logger,
		DB:          db,
		Jobs:        jobRepo,
		Repos:       repos,
		Services:    svc,
		Controllers: ctrl,
	}, nil
}

func (d *Dependencies) Close() {
	if d != nil && d.DB != nil {
		d.DB.Close()
	}
}

func (d *Dependencies) Router() http.Handler {
	return httpapi.NewRouter(d.Controllers)
}

func (d *Dependencies) WorkerGroup() *workers.Group {
	cfg := workers.FactoryConfig{
		WorkerID:     d.Config.WorkerID,
		BatchSize:    d.Config.BatchSize,
		PollInterval: d.Config.PollInterval,
	}
	selected := map[string]bool{}
	for _, workerType := range d.Config.WorkerTypes {
		selected[workerType] = true
	}
	var list []workers.Worker
	add := func(key string, worker workers.Worker) {
		if selected[key] {
			list = append(list, worker)
		}
	}
	add("events", workers.NewEventWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("rules", workers.NewRuleWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("scheduler", workers.NewSchedulerWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("memory", workers.NewMemoryWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("agent", workers.NewAgentWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("outbox", workers.NewOutboxWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("campaigns", workers.NewCampaignWorker(cfg, d.Jobs, d.Services, d.Logger))
	add("notifications", workers.NewNotificationWorker(cfg, d.Jobs, d.Services, d.Logger))
	return workers.NewGroup(d.Logger, list...)
}
