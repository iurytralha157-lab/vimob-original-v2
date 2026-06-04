package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"vimob-chatbot-backend/internal/ai"
	"vimob-chatbot-backend/internal/cache"
	"vimob-chatbot-backend/internal/commands"
	"vimob-chatbot-backend/internal/store"
	"vimob-chatbot-backend/internal/worker"
)

type Server struct {
	store         *store.Store
	cache         *cache.Cache
	pool          *worker.Pool
	ai            *ai.Service
	logger        *slog.Logger
	webhookSecret string
}

type WhatsAppWebhook struct {
	OrganizationID string          `json:"organization_id"`
	ConversationID string          `json:"conversation_id"`
	MessageID      string          `json:"message_id"`
	From           string          `json:"from"`
	To             string          `json:"to"`
	Text           string          `json:"text"`
	Payload        json.RawMessage `json:"payload"`
}

func NewServer(store *store.Store, cache *cache.Cache, pool *worker.Pool, aiService *ai.Service, logger *slog.Logger, webhookSecret string) *Server {
	return &Server{store: store, cache: cache, pool: pool, ai: aiService, logger: logger, webhookSecret: webhookSecret}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /v1/commands", s.listCommands)
	mux.HandleFunc("POST /v1/webhooks/whatsapp", s.whatsappWebhook)
	mux.HandleFunc("GET /v1/conversations/{conversation_id}/state", s.conversationState)
	mux.HandleFunc("GET /v1/ai/health", s.aiHealth)
	mux.HandleFunc("POST /v1/ai/preview", s.aiPreview)
	return s.withCORS(s.withJSON(mux))
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "vimob-chatbot-backend"})
}

func (s *Server) listCommands(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"commands": commands.List()})
}

func (s *Server) whatsappWebhook(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeWebhook(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}

	var input WhatsAppWebhook
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}

	if input.OrganizationID == "" || input.ConversationID == "" || input.MessageID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "missing_required_fields"})
		return
	}

	msg := store.InboundMessage{
		OrganizationID: input.OrganizationID,
		ConversationID: input.ConversationID,
		ExternalID:     input.MessageID,
		Channel:        "whatsapp",
		FromNumber:     input.From,
		ToNumber:       input.To,
		Body:           input.Text,
		Payload:        normalizePayload(input.Payload),
		ReceivedAt:     time.Now().UTC(),
	}
	if err := s.store.CreateInboundMessage(r.Context(), msg); err != nil {
		s.logger.Error("failed to store inbound message", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "store_failed"})
		return
	}

	queued := s.pool.Enqueue(worker.Job{
		OrganizationID: input.OrganizationID,
		ConversationID: input.ConversationID,
		MessageID:      input.MessageID,
		Body:           input.Text,
	})
	if !queued {
		writeJSON(w, http.StatusAccepted, map[string]any{"stored": true, "queued": false})
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"stored": true, "queued": true})
}

func (s *Server) authorizeWebhook(r *http.Request) bool {
	if s.webhookSecret == "" {
		return true
	}
	received := r.Header.Get("X-Vimob-Webhook-Secret")
	return subtle.ConstantTimeCompare([]byte(received), []byte(s.webhookSecret)) == 1
}

func (s *Server) conversationState(w http.ResponseWriter, r *http.Request) {
	conversationID := strings.TrimSpace(r.PathValue("conversation_id"))
	if conversationID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "missing_conversation_id"})
		return
	}

	state, ok, err := s.store.GetConversationState(r.Context(), conversationID)
	if err != nil {
		s.logger.Error("state lookup failed", "error", err, "conversation_id", conversationID)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "lookup_failed"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) aiHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.ai.Health())
}

func (s *Server) aiPreview(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeWebhook(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}

	var input ai.PreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}

	result, err := s.ai.Preview(r.Context(), input)
	if err != nil {
		s.logger.Error("ai preview failed", "error", err)
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) withJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "authorization, content-type, x-vimob-webhook-secret")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func normalizePayload(payload json.RawMessage) []byte {
	if len(payload) == 0 {
		return []byte(`{}`)
	}
	return payload
}
