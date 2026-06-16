package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type SendTextInput struct {
	OrganizationID string
	RegistryID     string
	Text           string
}

type SendResult struct {
	ProviderMessageID string
}

type Gateway interface {
	SendText(ctx context.Context, input SendTextInput) (SendResult, error)
}

type NoopGateway struct{}

func (g NoopGateway) SendText(_ context.Context, input SendTextInput) (SendResult, error) {
	return SendResult{
		ProviderMessageID: fmt.Sprintf("noop:%s:%d", input.RegistryID, time.Now().UTC().UnixNano()),
	}, nil
}

type LumiGateway struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

func NewLumiGateway(baseURL string, apiKey string) *LumiGateway {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://lume-io.com"
	}
	return &LumiGateway{
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		APIKey:  strings.TrimSpace(apiKey),
		HTTPClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (g *LumiGateway) SendText(ctx context.Context, input SendTextInput) (SendResult, error) {
	if strings.TrimSpace(g.APIKey) == "" {
		return SendResult{}, errors.New("lumi instance key is required")
	}
	text := strings.TrimSpace(input.Text)
	if text == "" {
		return SendResult{}, errors.New("text is required")
	}
	payload := map[string]string{"text": text}
	if isJID(input.RegistryID) {
		payload["jid"] = strings.TrimSpace(input.RegistryID)
	} else {
		payload["number"] = onlyDigits(input.RegistryID)
	}
	if payload["jid"] == "" && payload["number"] == "" {
		return SendResult{}, errors.New("recipient is required")
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return SendResult{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.BaseURL+"/message/sendText", bytes.NewReader(body))
	if err != nil {
		return SendResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", g.APIKey)

	client := g.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return SendResult{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SendResult{}, fmt.Errorf("lumi sendText failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var output struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(respBody, &output); err != nil {
		return SendResult{}, err
	}
	if output.ID == "" {
		return SendResult{}, errors.New("lumi sendText response missing id")
	}
	return SendResult{ProviderMessageID: output.ID}, nil
}

func isJID(value string) bool {
	return strings.Contains(value, "@")
}

func onlyDigits(value string) string {
	var out strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			out.WriteRune(r)
		}
	}
	return out.String()
}
