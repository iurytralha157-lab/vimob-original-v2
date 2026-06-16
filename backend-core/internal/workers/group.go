package workers

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"vimob/backend-core/internal/jobs"
)

type Worker interface {
	Name() string
	Start(ctx context.Context) error
}

type Group struct {
	workers []Worker
	logger  *slog.Logger
}

func NewGroup(logger *slog.Logger, workers ...Worker) *Group {
	return &Group{logger: logger, workers: workers}
}

func (g *Group) Start(ctx context.Context) error {
	var wg sync.WaitGroup
	for _, worker := range g.workers {
		w := worker
		wg.Add(1)
		go func() {
			defer wg.Done()
			g.logger.Info("worker starting", "worker", w.Name())
			if err := w.Start(ctx); err != nil && ctx.Err() == nil {
				g.logger.Error("worker stopped with error", "worker", w.Name(), "error", err)
			}
			g.logger.Info("worker stopped", "worker", w.Name())
		}()
	}
	<-ctx.Done()
	wg.Wait()
	return nil
}

type Handler func(ctx context.Context, job jobs.Job) error

type PollingWorker struct {
	name         string
	workerID     string
	jobTypes     []string
	batchSize    int
	pollInterval time.Duration
	jobs         *jobs.Repository
	logger       *slog.Logger
	handle       Handler
}

func NewPollingWorker(name string, workerID string, jobTypes []string, batchSize int, pollInterval time.Duration, repo *jobs.Repository, logger *slog.Logger, handle Handler) *PollingWorker {
	return &PollingWorker{
		name:         name,
		workerID:     workerID,
		jobTypes:     jobTypes,
		batchSize:    batchSize,
		pollInterval: pollInterval,
		jobs:         repo,
		logger:       logger,
		handle:       handle,
	}
}

func (w *PollingWorker) Name() string {
	return w.name
}

func (w *PollingWorker) Start(ctx context.Context) error {
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		if err := w.drain(ctx); err != nil {
			w.logger.Error("worker drain failed", "worker", w.name, "error", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (w *PollingWorker) drain(ctx context.Context) error {
	claimed, err := w.jobs.Claim(ctx, w.workerID+":"+w.name, w.jobTypes, w.batchSize)
	if err != nil {
		return err
	}
	for _, job := range claimed {
		if err := w.handle(ctx, job); err != nil {
			w.logger.Error("job failed", "worker", w.name, "job_id", job.ID, "job_type", job.Type, "error", err)
			_ = w.jobs.Fail(ctx, job, err)
			continue
		}
		_ = w.jobs.Complete(ctx, job.ID)
	}
	return nil
}
