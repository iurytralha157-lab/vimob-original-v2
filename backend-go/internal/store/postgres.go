package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

type InboundMessage struct {
	ID             string
	OrganizationID string
	ConversationID string
	ExternalID     string
	Channel        string
	FromNumber     string
	ToNumber       string
	Body           string
	Payload        []byte
	ReceivedAt     time.Time
}

type ConversationState struct {
	OrganizationID    string    `json:"organization_id"`
	ConversationID    string    `json:"conversation_id"`
	Channel           string    `json:"channel"`
	AutomationEnabled bool      `json:"automation_enabled"`
	LastResponseID    string    `json:"last_response_id,omitempty"`
	AgentStatus       string    `json:"agent_status"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type AIResolvedConfig struct {
	AgentID            string
	Model              string
	Mode               string
	SystemPrompt       string
	SafetyPrompt       string
	OrganizationPrompt string
	BusinessRules      string
	Temperature        float64
	MaxOutputTokens    int
	MaxContextMessages int
}

type AIInteractionLog struct {
	OrganizationID     string
	ConversationID     string
	AgentID            string
	JobID              string
	Mode               string
	EventType          string
	Model              string
	PromptTokens       int
	CompletionTokens   int
	TotalTokens        int
	EstimatedCostUSD   float64
	LatencyMS          int
	Success            bool
	ErrorMessage       string
	InputPreview       string
	OutputPreview      string
	Metadata           []byte
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) EnsureSchema(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, schemaSQL)
	return err
}

func (s *Store) CreateInboundMessage(ctx context.Context, msg InboundMessage) error {
	_, err := s.pool.Exec(ctx, `
		insert into chatbot_inbound_messages (
			organization_id, conversation_id, external_id, channel,
			from_number, to_number, body, payload, received_at
		)
		values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		on conflict (organization_id, channel, external_id) do nothing
	`, msg.OrganizationID, msg.ConversationID, msg.ExternalID, msg.Channel, msg.FromNumber, msg.ToNumber, msg.Body, msg.Payload, msg.ReceivedAt)
	return err
}

func (s *Store) UpsertConversationState(ctx context.Context, state ConversationState) error {
	_, err := s.pool.Exec(ctx, `
		insert into chatbot_conversation_state (
			organization_id, conversation_id, channel, automation_enabled,
			last_response_id, agent_status, updated_at
		)
		values ($1,$2,$3,$4,$5,$6,now())
		on conflict (organization_id, conversation_id) do update set
			channel = excluded.channel,
			automation_enabled = excluded.automation_enabled,
			last_response_id = coalesce(excluded.last_response_id, chatbot_conversation_state.last_response_id),
			agent_status = excluded.agent_status,
			updated_at = now()
	`, state.OrganizationID, state.ConversationID, state.Channel, state.AutomationEnabled, nullIfEmpty(state.LastResponseID), state.AgentStatus)
	return err
}

func (s *Store) GetConversationState(ctx context.Context, conversationID string) (ConversationState, bool, error) {
	var state ConversationState
	err := s.pool.QueryRow(ctx, `
		select organization_id, conversation_id, channel, automation_enabled,
		       coalesce(last_response_id, ''), agent_status, updated_at
		from chatbot_conversation_state
		where conversation_id = $1
	`, conversationID).Scan(
		&state.OrganizationID,
		&state.ConversationID,
		&state.Channel,
		&state.AutomationEnabled,
		&state.LastResponseID,
		&state.AgentStatus,
		&state.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ConversationState{}, false, nil
		}
		return ConversationState{}, false, err
	}
	return state, true, nil
}

func (s *Store) GetAIResolvedConfig(ctx context.Context, organizationID string, fallbackModel string) (AIResolvedConfig, error) {
	var cfg AIResolvedConfig
	err := s.pool.QueryRow(ctx, `
		select
			a.id,
			coalesce(nullif(a.default_model, ''), $2),
			coalesce(os.mode, 'preview'),
			a.system_prompt,
			a.safety_prompt,
			coalesce(os.organization_prompt, ''),
			coalesce(os.business_rules, ''),
			a.temperature::float8,
			coalesce(os.max_output_tokens, a.max_output_tokens),
			coalesce(os.max_context_messages, a.max_context_messages)
		from ai_global_agents a
		left join ai_organization_settings os
			on os.agent_id = a.id and os.organization_id = $1
		where a.slug = 'jenny'
		limit 1
	`, organizationID, fallbackModel).Scan(
		&cfg.AgentID,
		&cfg.Model,
		&cfg.Mode,
		&cfg.SystemPrompt,
		&cfg.SafetyPrompt,
		&cfg.OrganizationPrompt,
		&cfg.BusinessRules,
		&cfg.Temperature,
		&cfg.MaxOutputTokens,
		&cfg.MaxContextMessages,
	)
	return cfg, err
}

func (s *Store) CreateAIInteractionLog(ctx context.Context, log AIInteractionLog) error {
	if len(log.Metadata) == 0 {
		log.Metadata = []byte(`{}`)
	}
	_, err := s.pool.Exec(ctx, `
		insert into ai_interaction_logs (
			organization_id, conversation_id, agent_id, job_id, mode, event_type,
			model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
			latency_ms, success, error_message, input_preview, output_preview, metadata
		)
		values (
			nullif($1, '')::uuid, nullif($2, '')::uuid, nullif($3, '')::uuid, nullif($4, '')::uuid,
			$5, $6, $7, $8, $9, $10, $11, $12, $13, nullif($14, ''), nullif($15, ''), nullif($16, ''), $17
		)
	`, log.OrganizationID, log.ConversationID, log.AgentID, log.JobID, log.Mode, log.EventType,
		log.Model, log.PromptTokens, log.CompletionTokens, log.TotalTokens, log.EstimatedCostUSD,
		log.LatencyMS, log.Success, log.ErrorMessage, log.InputPreview, log.OutputPreview, log.Metadata)
	return err
}

func nullIfEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

const schemaSQL = `
create table if not exists chatbot_conversation_state (
	id bigserial primary key,
	organization_id uuid not null,
	conversation_id text not null,
	channel text not null default 'whatsapp',
	automation_enabled boolean not null default true,
	last_response_id text,
	agent_status text not null default 'pending',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (organization_id, conversation_id)
);

create table if not exists chatbot_inbound_messages (
	id bigserial primary key,
	organization_id uuid not null,
	conversation_id text not null,
	external_id text not null,
	channel text not null default 'whatsapp',
	from_number text,
	to_number text,
	body text,
	payload jsonb not null default '{}'::jsonb,
	received_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique (organization_id, channel, external_id)
);

create index if not exists idx_chatbot_inbound_conversation
	on chatbot_inbound_messages (organization_id, conversation_id, received_at desc);
`
