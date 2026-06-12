package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
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

	humanTakeover, err := p.store.HasRecentHumanTakeover(ctx, job.ConversationID, time.Now().Add(-6*time.Hour))
	if err != nil {
		p.logger.Error("auto reply human takeover check failed", "error", err, "conversation_id", job.ConversationID)
		return
	}
	if humanTakeover {
		_ = p.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    job.OrganizationID,
			ConversationID:    job.ConversationID,
			Channel:           "whatsapp",
			AutomationEnabled: false,
			AgentStatus:       "handed_off_human",
		})
		p.logger.Info("auto reply skipped: human takeover detected", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID)
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

	replyStartedAt := time.Now()
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

	if delay := humanReplyDelay(body, reply.Reply); delay > 0 {
		p.logger.Info("auto reply waiting humanized delay", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID, "delay_ms", delay.Milliseconds())
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}

		newerInbound, err := p.store.HasInboundMessageSince(ctx, job.ConversationID, replyStartedAt)
		if err != nil {
			p.logger.Warn("auto reply newer inbound check failed", "error", err, "conversation_id", job.ConversationID)
		}
		if newerInbound {
			_ = p.store.UpsertConversationState(ctx, store.ConversationState{
				OrganizationID:    job.OrganizationID,
				ConversationID:    job.ConversationID,
				Channel:           "whatsapp",
				AutomationEnabled: true,
				AgentStatus:       "auto_reply_skipped_newer_inbound",
			})
			p.logger.Info("auto reply skipped: newer inbound during delay", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID)
			return
		}

		humanTakeover, err := p.store.HasRecentHumanTakeover(ctx, job.ConversationID, replyStartedAt)
		if err != nil {
			p.logger.Warn("auto reply human takeover recheck failed", "error", err, "conversation_id", job.ConversationID)
		}
		if humanTakeover {
			_ = p.store.UpsertConversationState(ctx, store.ConversationState{
				OrganizationID:    job.OrganizationID,
				ConversationID:    job.ConversationID,
				Channel:           "whatsapp",
				AutomationEnabled: false,
				AgentStatus:       "handed_off_human",
			})
			p.logger.Info("auto reply skipped: human takeover during delay", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID)
			return
		}
	}

	chunks := splitWhatsAppReply(reply.Reply)
	fullReply := strings.Join(chunks, "\n\n")
	lastSentAt := time.Now()
	for i, chunk := range chunks {
		if i > 0 {
			time.Sleep(700 * time.Millisecond)
		}
		sentMessageID, err := p.sendWhatsAppText(ctx, conv.SessionID, number, chunk)
		if err != nil {
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
		lastSentAt = time.Now()

		if err := p.store.RecordAIWhatsAppMessage(ctx, job.ConversationID, conv.SessionID, sentMessageID, chunk); err != nil {
			p.logger.Error("auto reply history write failed", "error", err, "conversation_id", job.ConversationID)
			_ = p.store.UpsertConversationState(ctx, store.ConversationState{
				OrganizationID:    job.OrganizationID,
				ConversationID:    job.ConversationID,
				Channel:           "whatsapp",
				AutomationEnabled: true,
				AgentStatus:       "auto_reply_history_failed",
			})
			return
		}
	}

	if shouldNotifyHumanHandoff(body, fullReply) {
		p.notifyHumanHandoff(ctx, job.OrganizationID, job.ConversationID, "lead_ready_for_human")
		_ = p.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    job.OrganizationID,
			ConversationID:    job.ConversationID,
			Channel:           "whatsapp",
			AutomationEnabled: false,
			AgentStatus:       "handed_off_human",
		})
		p.logger.Info("auto reply handed off to human", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID)
		return
	}

	p.scheduleIdleFollowUp(ctx, job.OrganizationID, job.ConversationID, conv.SessionID, number, lastSentAt)

	_ = p.store.UpsertConversationState(ctx, store.ConversationState{
		OrganizationID:    job.OrganizationID,
		ConversationID:    job.ConversationID,
		Channel:           "whatsapp",
		AutomationEnabled: true,
		AgentStatus:       "auto_replied",
	})
	p.logger.Info("auto reply sent", "organization_id", job.OrganizationID, "conversation_id", job.ConversationID, "model", reply.Model, "latency_ms", reply.LatencyMS)
}

func (p *Pool) scheduleIdleFollowUp(ctx context.Context, organizationID string, conversationID string, sessionID string, number string, sentAt time.Time) {
	if strings.TrimSpace(sessionID) == "" || strings.TrimSpace(number) == "" {
		return
	}

	go func() {
		timer := time.NewTimer(10 * time.Minute)
		defer timer.Stop()

		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		replied, err := p.store.HasInboundMessageSince(ctx, conversationID, sentAt)
		if err != nil {
			p.logger.Warn("idle follow-up inbound check failed", "error", err, "conversation_id", conversationID)
			return
		}
		if replied {
			return
		}

		humanTakeover, err := p.store.HasRecentHumanTakeover(ctx, conversationID, sentAt)
		if err != nil {
			p.logger.Warn("idle follow-up human takeover check failed", "error", err, "conversation_id", conversationID)
			return
		}
		if humanTakeover {
			return
		}

		text := "Conseguiu dar uma olhada? Me fala se fez sentido pra voce ou se quer que eu busque outra opcao."
		sentMessageID, err := p.sendWhatsAppText(ctx, sessionID, number, text)
		if err != nil {
			p.logger.Warn("idle follow-up send failed", "error", err, "conversation_id", conversationID)
			return
		}
		if err := p.store.RecordAIWhatsAppMessage(ctx, conversationID, sessionID, sentMessageID, text); err != nil {
			p.logger.Warn("idle follow-up history write failed", "error", err, "conversation_id", conversationID)
			return
		}

		_ = p.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    organizationID,
			ConversationID:    conversationID,
			Channel:           "whatsapp",
			AutomationEnabled: true,
			AgentStatus:       "idle_follow_up_sent",
		})
		p.logger.Info("idle follow-up sent", "organization_id", organizationID, "conversation_id", conversationID)
	}()
}

func (p *Pool) notifyHumanHandoff(ctx context.Context, organizationID string, conversationID string, reason string) {
	target, ok, err := p.store.ResolveHandoffTarget(ctx, conversationID)
	if err != nil {
		p.logger.Error("handoff target lookup failed", "error", err, "conversation_id", conversationID)
		return
	}
	if !ok {
		p.logger.Warn("handoff notification skipped: missing target user", "conversation_id", conversationID)
		return
	}

	summary, err := p.store.BuildHandoffSummary(ctx, conversationID, 4)
	if err != nil {
		p.logger.Warn("handoff summary lookup failed", "error", err, "conversation_id", conversationID)
	}

	if err := p.store.CreateHandoffNotification(ctx, organizationID, conversationID, target, reason, summary); err != nil {
		p.logger.Error("handoff system notification failed", "error", err, "conversation_id", conversationID)
	}
	if strings.TrimSpace(p.supabaseURL) == "" || strings.TrimSpace(p.supabaseServiceRoleKey) == "" {
		return
	}

	leadName := strings.TrimSpace(target.Name)
	if leadName == "" {
		leadName = "Um lead"
	}
	message := "Jhenny chamou um corretor para " + leadName + ". Abra a conversa para continuar."
	if strings.TrimSpace(summary) != "" {
		message += "\n\nResumo:\n" + truncateText(summary, 600)
	}

	payload, err := json.Marshal(map[string]any{
		"organization_id": organizationID,
		"user_id":         target.UserID,
		"message":         message,
		"lead_id":         nullIfEmpty(target.LeadID),
	})
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.supabaseURL+"/functions/v1/whatsapp-notifier", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+p.supabaseServiceRoleKey)
	req.Header.Set("apikey", p.supabaseServiceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		p.logger.Warn("handoff whatsapp notification failed", "error", err, "conversation_id", conversationID)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		p.logger.Warn("handoff whatsapp notification returned non-2xx", "status", resp.StatusCode, "conversation_id", conversationID)
		return
	}
	var decoded map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err == nil {
		if success, ok := decoded["success"].(bool); ok && !success {
			p.logger.Warn("handoff whatsapp notification returned failure", "response", decoded, "conversation_id", conversationID)
		}
	}
}

func (p *Pool) sendWhatsAppText(ctx context.Context, sessionID string, number string, text string) (string, error) {
	payload, err := json.Marshal(map[string]any{
		"action":     "send.text",
		"session_id": sessionID,
		"body": map[string]any{
			"number": number,
			"text":   text,
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.supabaseURL+"/functions/v1/evolution-go-proxy", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.supabaseServiceRoleKey)
	req.Header.Set("apikey", p.supabaseServiceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var decoded map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return "", err
	}
	ok, _ := decoded["ok"].(bool)
	errorMessage, _ := decoded["error"].(string)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !ok {
		if errorMessage != "" {
			return "", errors.New(errorMessage)
		}
		return "", errors.New("evolution_go_proxy_send_failed")
	}
	return extractSentMessageID(decoded), nil
}

func extractSentMessageID(value any) string {
	keys := []string{
		"sentMessageId", "messageId", "messageID", "MessageID",
		"id", "ID", "Id",
	}
	nestedKeys := []string{
		"key", "Key", "data", "Data", "message", "Message", "response", "Response",
	}

	switch v := value.(type) {
	case map[string]any:
		for _, key := range keys {
			if text, ok := v[key].(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
		for _, key := range nestedKeys {
			if next, ok := v[key]; ok {
				if text := extractSentMessageID(next); text != "" {
					return text
				}
			}
		}
	case []any:
		for _, item := range v {
			if text := extractSentMessageID(item); text != "" {
				return text
			}
		}
	}

	return ""
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

var markdownLinkPattern = regexp.MustCompile(`\[[^\]]+\]\((https?://[^)\s]+)\)`)

func splitWhatsAppReply(reply string) []string {
	reply = strings.TrimSpace(markdownLinkPattern.ReplaceAllString(reply, "$1"))
	if reply == "" {
		return []string{"Certo, vou seguir por aqui."}
	}

	reply = strings.ReplaceAll(reply, "\r\n", "\n")
	reply = strings.ReplaceAll(reply, "\r", "\n")

	var chunks []string
	var current []string
	for _, line := range strings.Split(reply, "\n") {
		if strings.TrimSpace(line) == "" {
			if len(current) > 0 {
				chunks = append(chunks, strings.TrimSpace(strings.Join(current, "\n")))
				current = nil
			}
			continue
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		chunks = append(chunks, strings.TrimSpace(strings.Join(current, "\n")))
	}
	if len(chunks) == 0 {
		chunks = []string{reply}
	}

	chunks = splitLongReplyChunks(chunks, 900)
	if len(chunks) > 5 {
		merged := append([]string{}, chunks[:4]...)
		merged = append(merged, strings.Join(chunks[4:], "\n\n"))
		chunks = merged
	}
	return chunks
}

func splitLongReplyChunks(chunks []string, limit int) []string {
	var result []string
	for _, chunk := range chunks {
		chunk = strings.TrimSpace(chunk)
		if chunk == "" {
			continue
		}
		for len(chunk) > limit {
			cut := strings.LastIndexAny(chunk[:limit], ".!?")
			if cut < limit/2 {
				cut = strings.LastIndex(chunk[:limit], " ")
			}
			if cut < limit/2 {
				cut = limit
			}
			result = append(result, strings.TrimSpace(chunk[:cut+1]))
			chunk = strings.TrimSpace(chunk[cut+1:])
		}
		if chunk != "" {
			result = append(result, chunk)
		}
	}
	return result
}

func shouldNotifyHumanHandoff(userMessage string, aiReply string) bool {
	user := strings.ToLower(strings.TrimSpace(userMessage))
	reply := strings.ToLower(strings.TrimSpace(aiReply))

	directRequests := []string{
		"quero falar com consultor",
		"quero falar com corretor",
		"quero falar com especialista",
		"quero falar com atendente",
		"chama um consultor",
		"chamar um consultor",
		"chama um corretor",
		"chamar um corretor",
		"chama um especialista",
		"chamar um especialista",
		"pode chamar",
		"pode encaminhar",
		"sim pode encaminhar",
		"sim, pode encaminhar",
		"sim pode chamar",
		"sim, pode chamar",
		"manda para o consultor",
		"manda pro consultor",
		"manda para o corretor",
		"manda pro corretor",
		"encaminha para o consultor",
		"encaminha pro consultor",
		"encaminha para o corretor",
		"encaminha pro corretor",
		"me liga",
		"pode me ligar",
		"vamos marcar",
		"quero agendar",
		"agendar visita",
		"marcar visita",
	}
	for _, phrase := range directRequests {
		if strings.Contains(user, phrase) {
			return true
		}
	}

	replySignals := []string{
		"vou chamar um corretor",
		"vou chamar um especialista",
		"vou acionar um corretor",
		"vou acionar um especialista",
		"vou encaminhar",
		"vou te encaminhar",
		"vou passar para um corretor",
		"vou passar para um especialista",
		"vou passar para a equipe",
		"vou passar seu contato",
		"vou confirmar com a equipe",
		"um corretor vai",
		"um especialista vai",
		"equipe vai",
	}
	for _, phrase := range replySignals {
		if strings.Contains(reply, phrase) {
			return true
		}
	}
	return false
}

func humanReplyDelay(userMessage string, aiReply string) time.Duration {
	user := strings.ToLower(strings.TrimSpace(userMessage))
	reply := strings.ToLower(strings.TrimSpace(aiReply))
	if user == "" {
		return 0
	}

	delay := 45 * time.Second
	if len([]rune(userMessage)) > 80 || containsAnyText(user,
		"imovel", "casa", "apartamento", "apto", "valor", "preco",
		"bairro", "regiao", "financiamento", "entrada", "visita", "opcao", "opcoes",
	) {
		delay = 65 * time.Second
	}
	if containsAnyText(reply, "corretor", "especialista", "confirmar com a equipe", "agendar", "visita") {
		delay += 15 * time.Second
	}

	delay += time.Duration(len([]rune(userMessage))%18) * time.Second
	if delay > 100*time.Second {
		return 100 * time.Second
	}
	return delay
}

func containsAnyText(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func truncateText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	if limit <= 3 {
		return value[:limit]
	}
	return value[:limit-3] + "..."
}
