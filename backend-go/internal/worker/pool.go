package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"vimob-chatbot-backend/internal/ai"
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
	ai     *ai.Service
	logger *slog.Logger
	jobs   chan Job
	wg     sync.WaitGroup

	supabaseURL            string
	supabaseServiceRoleKey string
	autoOrganizations      map[string]bool
	httpClient             *http.Client
}

func NewPool(count int, store *store.Store, cache *cache.Cache, aiService *ai.Service, logger *slog.Logger, supabaseURL string, serviceRoleKey string, autoOrganizationIDs string) *Pool {
	return &Pool{
		count:                  count,
		store:                  store,
		cache:                  cache,
		ai:                     aiService,
		logger:                 logger,
		jobs:                   make(chan Job, 256),
		supabaseURL:            strings.TrimRight(supabaseURL, "/"),
		supabaseServiceRoleKey: serviceRoleKey,
		autoOrganizations:      parseAutoOrganizations(autoOrganizationIDs),
		httpClient:             &http.Client{Timeout: 20 * time.Second},
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
		AgentStatus:       "mirror_received",
	}
	if err := p.store.UpsertConversationState(ctx, state); err != nil {
		p.logger.Error("state upsert failed", "error", err, "conversation_id", job.ConversationID)
		return
	}

	cacheKey := "conversation:" + job.ConversationID + ":last_message"
	if err := p.cache.Set(cacheKey, job.Body, 30*time.Minute); err != nil {
		p.logger.Warn("cache write failed", "error", err, "key", cacheKey)
	}

	p.tryAutoReply(ctx, job)
}

func (p *Pool) tryAutoReply(ctx context.Context, job Job) {
	if !p.autoOrganizations[job.OrganizationID] {
		return
	}
	if strings.TrimSpace(p.supabaseURL) == "" || strings.TrimSpace(p.supabaseServiceRoleKey) == "" {
		p.logger.Warn("auto reply skipped: supabase credentials missing", "organization_id", job.OrganizationID)
		return
	}
	body := strings.TrimSpace(job.Body)
	if body == "" || isMediaPlaceholder(body) {
		return
	}
	inbound, err := p.store.IsInboundWhatsAppMessage(ctx, job.ConversationID, job.MessageID)
	if err != nil {
		p.logger.Error("auto reply inbound check failed", "error", err, "conversation_id", job.ConversationID, "message_id", job.MessageID)
		return
	}
	if !inbound {
		return
	}

	conv, ok, err := p.store.GetWhatsAppConversation(ctx, job.ConversationID)
	if err != nil {
		p.logger.Error("auto reply conversation lookup failed", "error", err, "conversation_id", job.ConversationID)
		return
	}
	if !ok || conv.IsGroup || conv.SessionID == "" {
		return
	}

	reply, err := p.ai.AutoReply(ctx, job.OrganizationID, job.ConversationID, body)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			p.logger.Info("auto reply skipped", "reason", err.Error(), "organization_id", job.OrganizationID, "conversation_id", job.ConversationID)
		}
		_ = p.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    job.OrganizationID,
			ConversationID:    job.ConversationID,
			Channel:           "whatsapp",
			AutomationEnabled: true,
			AgentStatus:       "auto_reply_skipped",
		})
		return
	}

	number := normalizePhone(conv.ContactPhone)
	if number == "" {
		number = normalizePhone(conv.RemoteJID)
	}
	if number == "" {
		p.logger.Warn("auto reply skipped: missing recipient number", "conversation_id", job.ConversationID)
		return
	}

	if err := p.sendWhatsAppText(ctx, conv.SessionID, number, reply.Reply); err != nil {
		p.logger.Error("auto reply send failed", "error", err, "conversation_id", job.ConversationID)
		_ = p.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    job.OrganizationID,
			ConversationID:    job.ConversationID,
			Channel:           "whatsapp",
			AutomationEnabled: true,
			AgentStatus:       "auto_reply_send_failed",
		})
		return
	}

	_ = p.store.UpsertConversationState(ctx, store.ConversationState{
		OrganizationID:    job.OrganizationID,
		ConversationID:    job.ConversationID,
		Channel:           "whatsapp",
		AutomationEnabled: true,
		AgentStatus:       "auto_replied",
	})
	p.logger.Info("auto reply sent", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID, "model", reply.Model, "latency_ms", reply.LatencyMS)
}

func (p *Pool) sendWhatsAppText(ctx context.Context, sessionID string, number string, text string) error {
	payload, err := json.Marshal(map[string]any{
		"action":     "send.text",
		"session_id": sessionID,
		"body": map[string]any{
			"number": number,
			"text":   text,
		},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.supabaseURL+"/functions/v1/evolution-go-proxy", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.supabaseServiceRoleKey)
	req.Header.Set("apikey", p.supabaseServiceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var decoded struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&decoded)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !decoded.OK {
		if decoded.Error != "" {
			return errors.New(decoded.Error)
		}
		return errors.New("evolution_go_proxy_send_failed")
	}
	return nil
}

func parseAutoOrganizations(raw string) map[string]bool {
	result := make(map[string]bool)
	for _, item := range strings.Split(raw, ",") {
		id := strings.TrimSpace(item)
		if id != "" {
			result[id] = true
		}
	}
	return result
}

func normalizePhone(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	digits := b.String()
	if len(digits) >= 12 && strings.HasPrefix(digits, "55") {
		return digits
	}
	if len(digits) >= 10 && len(digits) <= 11 {
		return "55" + digits
	}
	return digits
}

func isMediaPlaceholder(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "[figurinha]", "[imagem]", "[áudio]", "[audio]", "[vídeo]", "[video]", "[documento]", "[arquivo]":
		return true
	default:
		return false
	}
}
