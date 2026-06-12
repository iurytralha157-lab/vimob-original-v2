package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"vimob-chatbot-backend/internal/store"
)

type Service struct {
	store        *store.Store
	logger       *slog.Logger
	openAIKey    string
	defaultModel string
	client       *http.Client
}

type PreviewRequest struct {
	OrganizationID string `json:"organization_id"`
	Message        string `json:"message"`
	UseOpenAI      bool   `json:"use_openai"`
}

type PreviewResponse struct {
	Reply            string `json:"reply"`
	Model            string `json:"model"`
	Mode             string `json:"mode"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	TotalTokens      int    `json:"total_tokens"`
	LatencyMS        int    `json:"latency_ms"`
	SkippedOpenAI    bool   `json:"skipped_openai"`
}

type AutoReplyResult struct {
	Reply            string
	Model            string
	Mode             string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	LatencyMS        int
}

func NewService(store *store.Store, logger *slog.Logger, openAIKey string, defaultModel string) *Service {
	if defaultModel == "" {
		defaultModel = "gpt-4.1-nano"
	}
	return &Service{
		store:        store,
		logger:       logger,
		openAIKey:    openAIKey,
		defaultModel: defaultModel,
		client:       &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *Service) Health() map[string]any {
	return map[string]any{
		"ok":             true,
		"service":        "jenny-ai",
		"openai_enabled": s.openAIKey != "",
		"default_model":  s.defaultModel,
	}
}

func (s *Service) Preview(ctx context.Context, input PreviewRequest) (PreviewResponse, error) {
	input.OrganizationID = strings.TrimSpace(input.OrganizationID)
	input.Message = strings.TrimSpace(input.Message)
	if input.OrganizationID == "" {
		return PreviewResponse{}, errors.New("missing_organization_id")
	}
	if input.Message == "" {
		return PreviewResponse{}, errors.New("missing_message")
	}

	cfg, err := s.store.GetAIResolvedConfig(ctx, input.OrganizationID, s.defaultModel)
	if err != nil {
		return PreviewResponse{}, err
	}

	started := time.Now()
	result := PreviewResponse{
		Model: cfg.Model,
		Mode:  cfg.Mode,
	}

	if !input.UseOpenAI || s.openAIKey == "" {
		result.SkippedOpenAI = true
		result.Reply = s.dryRunReply(cfg, input.Message)
		result.LatencyMS = int(time.Since(started).Milliseconds())
		_ = s.store.CreateAIInteractionLog(ctx, store.AIInteractionLog{
			OrganizationID: input.OrganizationID,
			AgentID:        cfg.AgentID,
			Mode:           "preview",
			EventType:      "preview_dry_run",
			Model:          cfg.Model,
			LatencyMS:      result.LatencyMS,
			Success:        true,
			InputPreview:   truncate(input.Message, 500),
			OutputPreview:  truncate(result.Reply, 500),
			Metadata:       []byte(`{"skipped_openai":true}`),
		})
		return result, nil
	}

	reply, usage, _, err := s.callOpenAI(ctx, cfg, input.Message, "", "")
	result.LatencyMS = int(time.Since(started).Milliseconds())
	if err != nil {
		_ = s.store.CreateAIInteractionLog(ctx, store.AIInteractionLog{
			OrganizationID: input.OrganizationID,
			AgentID:        cfg.AgentID,
			Mode:           "preview",
			EventType:      "preview_error",
			Model:          cfg.Model,
			LatencyMS:      result.LatencyMS,
			Success:        false,
			ErrorMessage:   err.Error(),
			InputPreview:   truncate(input.Message, 500),
			Metadata:       []byte(`{}`),
		})
		return PreviewResponse{}, err
	}

	result.Reply = reply
	result.PromptTokens = usage.InputTokens
	result.CompletionTokens = usage.OutputTokens
	result.TotalTokens = usage.TotalTokens

	_ = s.store.CreateAIInteractionLog(ctx, store.AIInteractionLog{
		OrganizationID:   input.OrganizationID,
		AgentID:          cfg.AgentID,
		Mode:             "preview",
		EventType:        "preview_response",
		Model:            cfg.Model,
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.TotalTokens,
		EstimatedCostUSD: estimateCostUSD(cfg.Model, usage.InputTokens, usage.OutputTokens),
		LatencyMS:        result.LatencyMS,
		Success:          true,
		InputPreview:     truncate(input.Message, 500),
		OutputPreview:    truncate(reply, 500),
		Metadata:         []byte(`{"provider":"openai"}`),
	})

	return result, nil
}

func (s *Service) AutoReply(ctx context.Context, organizationID string, conversationID string, message string) (AutoReplyResult, error) {
	organizationID = strings.TrimSpace(organizationID)
	message = strings.TrimSpace(message)
	if organizationID == "" {
		return AutoReplyResult{}, errors.New("missing_organization_id")
	}
	if message == "" {
		return AutoReplyResult{}, errors.New("missing_message")
	}
	if s.openAIKey == "" {
		return AutoReplyResult{}, errors.New("openai_key_not_configured")
	}

	cfg, err := s.store.GetAIResolvedConfig(ctx, organizationID, s.defaultModel)
	if err != nil {
		return AutoReplyResult{}, err
	}
	if !cfg.IsEnabled || cfg.Mode != "auto" {
		return AutoReplyResult{}, errors.New("ai_not_enabled_for_auto")
	}
	if cfg.RequireApproval {
		return AutoReplyResult{}, errors.New("human_approval_required")
	}
	if matchesHandoffKeyword(message, cfg.HandoffKeywords) {
		return AutoReplyResult{}, errors.New("handoff_keyword_detected")
	}

	state, _, _ := s.store.GetConversationState(ctx, conversationID)
	contextText, _ := s.store.BuildAutoReplyContext(ctx, organizationID, conversationID, message, cfg.MaxContextMessages)

	started := time.Now()
	reply, usage, responseID, err := s.callOpenAI(ctx, cfg, message, contextText, state.LastResponseID)
	latencyMS := int(time.Since(started).Milliseconds())
	if err != nil {
		_ = s.store.CreateAIInteractionLog(ctx, store.AIInteractionLog{
			OrganizationID: organizationID,
			ConversationID: conversationID,
			AgentID:        cfg.AgentID,
			Mode:           "auto",
			EventType:      "auto_reply_error",
			Model:          cfg.Model,
			LatencyMS:      latencyMS,
			Success:        false,
			ErrorMessage:   err.Error(),
			InputPreview:   truncate(message, 500),
			Metadata:       []byte(`{"provider":"openai"}`),
		})
		return AutoReplyResult{}, err
	}

	if responseID != "" {
		_ = s.store.UpsertConversationState(ctx, store.ConversationState{
			OrganizationID:    organizationID,
			ConversationID:    conversationID,
			Channel:           "whatsapp",
			AutomationEnabled: true,
			LastResponseID:    responseID,
			AgentStatus:       "auto_reply_response_stored",
		})
	}

	_ = s.store.CreateAIInteractionLog(ctx, store.AIInteractionLog{
		OrganizationID:   organizationID,
		ConversationID:   conversationID,
		AgentID:          cfg.AgentID,
		Mode:             "auto",
		EventType:        "auto_reply_generated",
		Model:            cfg.Model,
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.TotalTokens,
		EstimatedCostUSD: estimateCostUSD(cfg.Model, usage.InputTokens, usage.OutputTokens),
		LatencyMS:        latencyMS,
		Success:          true,
		InputPreview:     truncate(message, 500),
		OutputPreview:    truncate(reply, 500),
		Metadata:         []byte(fmt.Sprintf(`{"provider":"openai","response_id":%q}`, responseID)),
	})

	return AutoReplyResult{
		Reply:            reply,
		Model:            cfg.Model,
		Mode:             cfg.Mode,
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.TotalTokens,
		LatencyMS:        latencyMS,
	}, nil
}

func (s *Service) dryRunReply(cfg store.AIResolvedConfig, message string) string {
	orgRule := ""
	if strings.TrimSpace(cfg.OrganizationPrompt) != "" {
		orgRule = " Vou considerar as regras especificas configuradas para esta organizacao."
	}
	return fmt.Sprintf("Preview sem custo da Jenny: recebi %q.%s Quando a chave OpenAI estiver ativa e o modo permitir, eu responderei usando apenas o contexto autorizado desta organizacao.", truncate(message, 120), orgRule)
}

func matchesHandoffKeyword(message string, keywords []string) bool {
	normalizedMessage := strings.ToLower(strings.TrimSpace(message))
	if normalizedMessage == "" {
		return false
	}
	for _, keyword := range keywords {
		normalizedKeyword := strings.ToLower(strings.TrimSpace(keyword))
		if normalizedKeyword != "" && strings.Contains(normalizedMessage, normalizedKeyword) {
			return true
		}
	}
	return false
}

type openAIUsage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
}

func (s *Service) callOpenAI(ctx context.Context, cfg store.AIResolvedConfig, message string, contextText string, previousResponseID string) (string, openAIUsage, string, error) {
	instructions := strings.TrimSpace(strings.Join([]string{
		cfg.SystemPrompt,
		cfg.SafetyPrompt,
		"Contexto da organizacao atual:",
		cfg.OrganizationPrompt,
		cfg.BusinessRules,
		"Responda em portugues do Brasil. Seja breve. Nao invente dados. Se precisar de dados nao autorizados, diga que vai chamar um humano.",
	}, "\n\n"))

	input := []map[string]string{
		{"role": "system", "content": instructions},
	}
	if strings.TrimSpace(contextText) != "" {
		input = append(input, map[string]string{
			"role":    "system",
			"content": "Contexto operacional autorizado desta conversa:\n" + strings.TrimSpace(contextText),
		})
	}
	input = append(input, map[string]string{"role": "user", "content": message})

	body := map[string]any{
		"model":             cfg.Model,
		"input":             input,
		"store":             true,
		"max_output_tokens": cfg.MaxOutputTokens,
		"temperature":       cfg.Temperature,
	}
	if strings.TrimSpace(previousResponseID) != "" {
		body["previous_response_id"] = strings.TrimSpace(previousResponseID)
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", openAIUsage{}, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(raw))
	if err != nil {
		return "", openAIUsage{}, "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.openAIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", openAIUsage{}, "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", openAIUsage{}, "", fmt.Errorf("openai_error_%d: %s", resp.StatusCode, truncate(string(respBody), 600))
	}

	var decoded struct {
		ID         string `json:"id"`
		OutputText string `json:"output_text"`
		Output     []struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
			TotalTokens  int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return "", openAIUsage{}, "", err
	}

	reply := strings.TrimSpace(decoded.OutputText)
	if reply == "" {
		for _, item := range decoded.Output {
			for _, content := range item.Content {
				if strings.TrimSpace(content.Text) != "" {
					reply = strings.TrimSpace(content.Text)
					break
				}
			}
			if reply != "" {
				break
			}
		}
	}
	if reply == "" {
		return "", openAIUsage{}, "", errors.New("empty_openai_response")
	}

	return reply, openAIUsage{
		InputTokens:  decoded.Usage.InputTokens,
		OutputTokens: decoded.Usage.OutputTokens,
		TotalTokens:  decoded.Usage.TotalTokens,
	}, decoded.ID, nil
}

func estimateCostUSD(model string, inputTokens int, outputTokens int) float64 {
	inputPerMillion := 0.10
	outputPerMillion := 0.40
	switch model {
	case "gpt-4o-mini":
		inputPerMillion = 0.15
		outputPerMillion = 0.60
	case "gpt-4.1-mini":
		inputPerMillion = 0.40
		outputPerMillion = 1.60
	}
	return (float64(inputTokens)/1000000)*inputPerMillion + (float64(outputTokens)/1000000)*outputPerMillion
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
