package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vimob-chatbot-backend/internal/ai"
	"vimob-chatbot-backend/internal/cache"
	"vimob-chatbot-backend/internal/config"
	"vimob-chatbot-backend/internal/httpapi"
	"vimob-chatbot-backend/internal/store"
	"vimob-chatbot-backend/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.EnsureSchema(ctx); err != nil {
		logger.Error("schema check failed", "error", err)
		os.Exit(1)
	}

	localCache, err := cache.Open(cfg.BuntDBPath)
	if err != nil {
		logger.Error("cache open failed", "error", err)
		os.Exit(1)
	}
	defer localCache.Close()

	aiService := ai.NewService(db, logger, cfg.OpenAIKey, cfg.DefaultModel)
	pool := worker.NewPool(
		cfg.WorkerCount,
		db,
		localCache,
		aiService,
		logger,
		cfg.SupabaseURL,
		cfg.SupabaseServiceRoleKey,
		cfg.AIAutoOrganizationIDs,
	)
	pool.Start(ctx)

	api := httpapi.NewServer(db, localCache, pool, aiService, logger, cfg.WebhookSecret)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("chatbot backend listening", "addr", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("http shutdown failed", "error", err)
	}
	pool.Stop()
	logger.Info("chatbot backend stopped")
}
