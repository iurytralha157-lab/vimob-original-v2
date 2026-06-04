package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"vimob-chatbot-backend/internal/cache"
	"vimob-chatbot-backend/internal/store"
)

type Job struct {
	OrganizationID string
	ConversationID string
	MessageID      string
	Body           string
}

type Pool struct {
	count  int
	store  *store.Store
	cache  *cache.Cache
	logger *slog.Logger
	jobs   chan Job
	wg     sync.WaitGroup
}

func NewPool(count int, store *store.Store, cache *cache.Cache, logger *slog.Logger) *Pool {
	return &Pool{
		count:  count,
		store:  store,
		cache:  cache,
		logger: logger,
		jobs:   make(chan Job, 256),
	}
}

func (p *Pool) Start(ctx context.Context) {
	for i := 0; i < p.count; i++ {
		workerID := i + 1
		p.wg.Add(1)
		go func() {
			defer p.wg.Done()
			p.run(ctx, workerID)
		}()
	}
}

func (p *Pool) Enqueue(job Job) bool {
	select {
	case p.jobs <- job:
		return true
	default:
		return false
	}
}

func (p *Pool) Stop() {
	close(p.jobs)
	p.wg.Wait()
}

func (p *Pool) run(ctx context.Context, workerID int) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-p.jobs:
			if !ok {
				return
			}
			p.handle(ctx, workerID, job)
		}
	}
}

func (p *Pool) handle(ctx context.Context, workerID int, job Job) {
	p.logger.Info("processing chatbot job", "worker", workerID, "conversation_id", job.ConversationID)

	state := store.ConversationState{
		OrganizationID:    job.OrganizationID,
		ConversationID:    job.ConversationID,
		Channel:           "whatsapp",
		AutomationEnabled: true,
		AgentStatus:       "queued_for_agent_worker",
	}
	if err := p.store.UpsertConversationState(ctx, state); err != nil {
		p.logger.Error("state upsert failed", "error", err, "conversation_id", job.ConversationID)
		return
	}

	cacheKey := "conversation:" + job.ConversationID + ":last_message"
	if err := p.cache.Set(cacheKey, job.Body, 30*time.Minute); err != nil {
		p.logger.Warn("cache write failed", "error", err, "key", cacheKey)
	}
}
