package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
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
	ContextResetAt    time.Time `json:"context_reset_at,omitempty"`
	HasContextReset   bool      `json:"has_context_reset"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type WhatsAppConversation struct {
	ID             string
	OrganizationID string
	SessionID      string
	LeadID         string
	RemoteJID      string
	ContactPhone   string
	IsGroup        bool
}

type HandoffTarget struct {
	LeadID string
	UserID string
	Name   string
	Phone  string
}

type recentMessage struct {
	FromMe  bool
	Content string
}

type propertySummary struct {
	Code         string
	Title        string
	Description  string
	PropertyType string
	DealType     string
	Neighborhood string
	City         string
	State        string
	Bedrooms    string
	Suites       string
	Bathrooms    string
	ParkingSpots string
	Area        string
	TotalArea   string
	Price       string
	RentPrice   string
	CondoFee    string
	PropertyTax string
	PublicURL   string
}

type AIResolvedConfig struct {
	AgentID            string
	IsEnabled          bool
	Model              string
	Mode               string
	SystemPrompt       string
	SafetyPrompt       string
	OrganizationPrompt string
	BusinessRules      string
	RequireApproval    bool
	HandoffKeywords    []string
	Temperature        float64
	MaxOutputTokens    int
	MaxContextMessages int
}

type AIInteractionLog struct {
	OrganizationID   string
	ConversationID   string
	AgentID          string
	JobID            string
	Mode             string
	EventType        string
	Model            string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	EstimatedCostUSD float64
	LatencyMS        int
	Success          bool
	ErrorMessage     string
	InputPreview     string
	OutputPreview    string
	Metadata         []byte
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
			last_response_id, agent_status, context_reset_at, updated_at
		)
		values ($1,$2,$3,$4,$5,$6,$7,now())
		on conflict (organization_id, conversation_id) do update set
			channel = excluded.channel,
			automation_enabled = excluded.automation_enabled,
			last_response_id = coalesce(excluded.last_response_id, chatbot_conversation_state.last_response_id),
			agent_status = excluded.agent_status,
			context_reset_at = coalesce(excluded.context_reset_at, chatbot_conversation_state.context_reset_at),
			updated_at = now()
	`, state.OrganizationID, state.ConversationID, state.Channel, state.AutomationEnabled, nullIfEmpty(state.LastResponseID), state.AgentStatus, nullIfZeroTime(state.ContextResetAt))
	return err
}

func (s *Store) GetConversationState(ctx context.Context, conversationID string) (ConversationState, bool, error) {
	var state ConversationState
	err := s.pool.QueryRow(ctx, `
		select organization_id, conversation_id, channel, automation_enabled,
		       coalesce(last_response_id, ''),
		       agent_status,
		       coalesce(context_reset_at, 'epoch'::timestamptz),
		       context_reset_at is not null,
		       updated_at
		from chatbot_conversation_state
		where conversation_id = $1
	`, conversationID).Scan(
		&state.OrganizationID,
		&state.ConversationID,
		&state.Channel,
		&state.AutomationEnabled,
		&state.LastResponseID,
		&state.AgentStatus,
		&state.ContextResetAt,
		&state.HasContextReset,
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

func (s *Store) GetWhatsAppConversation(ctx context.Context, conversationID string) (WhatsAppConversation, bool, error) {
	var conv WhatsAppConversation
	err := s.pool.QueryRow(ctx, `
		select
			id,
			organization_id,
			session_id,
			coalesce(lead_id::text, ''),
			coalesce(remote_jid, ''),
			coalesce(contact_phone, ''),
			coalesce(is_group, false)
		from whatsapp_conversations
		where id = $1
		  and deleted_at is null
	`, conversationID).Scan(
		&conv.ID,
		&conv.OrganizationID,
		&conv.SessionID,
		&conv.LeadID,
		&conv.RemoteJID,
		&conv.ContactPhone,
		&conv.IsGroup,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return WhatsAppConversation{}, false, nil
		}
		return WhatsAppConversation{}, false, err
	}
	return conv, true, nil
}

func (s *Store) IsInboundWhatsAppMessage(ctx context.Context, conversationID string, messageID string) (bool, error) {
	if strings.TrimSpace(messageID) == "" {
		return true, nil
	}

	var fromMe bool
	err := s.pool.QueryRow(ctx, `
		select coalesce(from_me, false)
		from whatsapp_messages
		where conversation_id = $1
		  and message_id = $2
		order by sent_at desc nulls last
		limit 1
	`, conversationID, messageID).Scan(&fromMe)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil
		}
		return false, err
	}
	return !fromMe, nil
}

func (s *Store) HasRecentHumanTakeover(ctx context.Context, conversationID string, since time.Time) (bool, error) {
	if since.IsZero() {
		since = time.Now().Add(-6 * time.Hour)
	}

	var exists bool
	err := s.pool.QueryRow(ctx, `
		select
			exists (
				select 1
				from whatsapp_messages
				where conversation_id = $1
				  and coalesce(from_me, false) = true
				  and nullif(sender_name, '') is not null
				  and not (
				    lower(sender_name) like '%jhenny%'
				    or lower(sender_name) like '%jenny%'
				    or lower(sender_name) in ('ia', 'ai')
				    or lower(sender_name) like 'automa%'
				  )
				  and sent_at >= $2
				limit 1
			)
			or exists (
				select 1
				from outbox_messages
				where conversation_id = $1
				  and created_by is not null
				  and created_at >= $2
				limit 1
			)
	`, conversationID, since).Scan(&exists)
	return exists, err
}

func (s *Store) HasInboundMessageSince(ctx context.Context, conversationID string, since time.Time) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		select exists (
			select 1
			from whatsapp_messages
			where conversation_id = $1
			  and coalesce(from_me, false) = false
			  and sent_at > $2
			limit 1
		)
	`, conversationID, since).Scan(&exists)
	return exists, err
}

func (s *Store) GetAIResolvedConfig(ctx context.Context, organizationID string, fallbackModel string) (AIResolvedConfig, error) {
	var cfg AIResolvedConfig
	err := s.pool.QueryRow(ctx, `
		select
			a.id,
			coalesce(os.is_enabled, false),
			coalesce(nullif(a.default_model, ''), $2),
			coalesce(os.mode, 'preview'),
			a.system_prompt,
			a.safety_prompt,
			coalesce(os.organization_prompt, ''),
			coalesce(os.business_rules, ''),
			coalesce(os.require_human_approval, true),
			coalesce(os.handoff_keywords, array[]::text[]),
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
		&cfg.IsEnabled,
		&cfg.Model,
		&cfg.Mode,
		&cfg.SystemPrompt,
		&cfg.SafetyPrompt,
		&cfg.OrganizationPrompt,
		&cfg.BusinessRules,
		&cfg.RequireApproval,
		&cfg.HandoffKeywords,
		&cfg.Temperature,
		&cfg.MaxOutputTokens,
		&cfg.MaxContextMessages,
	)
	return cfg, err
}

func (s *Store) RecordAIWhatsAppMessage(ctx context.Context, conversationID string, sessionID string, messageID string, content string) error {
	_, err := s.pool.Exec(ctx, `
		with payload as (
			select coalesce(nullif($3, ''), 'jhenny-' || gen_random_uuid()::text) as message_id
		),
		saved as (
			insert into whatsapp_messages (
				conversation_id,
				session_id,
				message_id,
				client_message_id,
				from_me,
				content,
				message_type,
				remote_jid,
				status,
				sent_at,
				sender_name
			)
			select
				$1::uuid,
				$2::uuid,
				payload.message_id,
				payload.message_id,
				true,
				$4,
				'text',
				wc.remote_jid,
				'sent',
				now(),
				'Jhenny'
			from payload
			left join whatsapp_conversations wc on wc.id = $1::uuid
			on conflict (session_id, message_id) do update
			set
				content = excluded.content,
				status = 'sent',
				sent_at = now(),
				sender_name = 'Jhenny'
			returning id
		)
		update whatsapp_conversations
		set
			last_message = $4,
			last_message_at = now(),
			unread_count = 0,
			updated_at = now()
		where id = $1::uuid
		  and exists (select 1 from saved)
	`, conversationID, sessionID, messageID, content)
	return err
}

func (s *Store) ResolveHandoffTarget(ctx context.Context, conversationID string) (HandoffTarget, bool, error) {
	var target HandoffTarget
	err := s.pool.QueryRow(ctx, `
		select
			coalesce(l.id::text, ''),
			coalesce(l.assigned_user_id::text, ws.owner_user_id::text, ''),
			coalesce(l.name, wc.contact_name, 'Lead'),
			coalesce(l.phone, wc.contact_phone, '')
		from whatsapp_conversations wc
		left join leads l on l.id = wc.lead_id
		left join whatsapp_sessions ws on ws.id = wc.session_id
		where wc.id = $1
		limit 1
	`, conversationID).Scan(&target.LeadID, &target.UserID, &target.Name, &target.Phone)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return HandoffTarget{}, false, nil
		}
		return HandoffTarget{}, false, err
	}
	return target, target.UserID != "", nil
}

func (s *Store) CreateHandoffNotification(ctx context.Context, organizationID string, conversationID string, target HandoffTarget, reason string, summary string) error {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(target.UserID) == "" {
		return nil
	}

	content := strings.TrimSpace(target.Name)
	if content == "" {
		content = "Um lead"
	}
	content = "Jhenny identificou que " + content + " precisa de um corretor."
	if reason != "" {
		content += " Motivo: " + reason + "."
	}
	if strings.TrimSpace(summary) != "" {
		content += "\n\nResumo:\n" + truncate(summary, 600)
	}

	_, err := s.pool.Exec(ctx, `
		insert into notifications (organization_id, user_id, lead_id, type, title, content, is_read)
		select
			$1::uuid,
			$2::uuid,
			nullif($3, '')::uuid,
			'ai_handoff',
			'Jhenny chamou um corretor',
			$4,
			false
		where not exists (
			select 1
			from notifications
			where organization_id = $1::uuid
			  and user_id = $2::uuid
			  and coalesce(lead_id::text, '') = coalesce(nullif($3, ''), '')
			  and type = 'ai_handoff'
			  and created_at >= now() - interval '10 minutes'
		)
	`, organizationID, target.UserID, target.LeadID, content)
	return err
}

func (s *Store) BuildHandoffSummary(ctx context.Context, conversationID string, limit int) (string, error) {
	if limit <= 0 || limit > 6 {
		limit = 4
	}

	var name string
	var propertyCode string
	var valueRange string
	var targetValue string
	var neighborhood string
	var city string
	var state string
	var initialMessage string

	err := s.pool.QueryRow(ctx, `
		select
			coalesce(l.name, wc.contact_name, 'Lead'),
			coalesce(l.property_code, ''),
			coalesce(l.faixa_valor_imovel, ''),
			coalesce(l.valor_interesse::text, ''),
			coalesce(l.bairro, ''),
			coalesce(l.cidade, ''),
			coalesce(l.uf, ''),
			coalesce(l.message, l.initial_message, '')
		from whatsapp_conversations wc
		left join leads l on l.id = wc.lead_id
		where wc.id = $1
		limit 1
	`, conversationID).Scan(
		&name,
		&propertyCode,
		&valueRange,
		&targetValue,
		&neighborhood,
		&city,
		&state,
		&initialMessage,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	rows, err := s.pool.Query(ctx, `
		select coalesce(content, '')
		from whatsapp_messages
		where conversation_id = $1
		  and message_type = 'text'
		  and coalesce(content, '') <> ''
		  and coalesce(from_me, false) = false
		order by sent_at desc
		limit $2
	`, conversationID, limit)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var messages []string
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			return "", err
		}
		messages = append(messages, truncate(content, 140))
	}

	var b strings.Builder
	writeContextLine(&b, "Lead", name)
	writeContextLine(&b, "Imovel citado/cadastrado", propertyCode)
	writeContextLine(&b, "Faixa/valor", joinNonEmpty(" / ", valueRange, formatCurrencyBRL(targetValue)))
	writeContextLine(&b, "Regiao", joinNonEmpty(", ", neighborhood, city, state))
	writeContextLine(&b, "Mensagem inicial", truncate(initialMessage, 120))
	if len(messages) > 0 {
		var leadLines []string
		for i := len(messages) - 1; i >= 0; i-- {
			if strings.TrimSpace(messages[i]) != "" {
				leadLines = append(leadLines, strings.TrimSpace(messages[i]))
			}
		}
		writeContextLine(&b, "Ultimas intencoes do lead", strings.Join(leadLines, " | "))
	}
	if strings.TrimSpace(b.String()) == "" {
		return "", rows.Err()
	}
	return truncate(strings.TrimSpace(b.String()), 700), rows.Err()
}

func (s *Store) BuildAutoReplyContext(ctx context.Context, organizationID string, conversationID string, message string, maxMessages int) (string, error) {
	if maxMessages <= 0 || maxMessages > 4 {
		maxMessages = 4
	}

	var sections []string
	historySince := time.Unix(0, 0)
	if state, ok, err := s.GetConversationState(ctx, conversationID); err == nil && ok && state.HasContextReset {
		historySince = state.ContextResetAt
	}

	if leadText, err := s.leadContext(ctx, organizationID, conversationID); err == nil && leadText != "" {
		sections = append(sections, leadText)
	}
	if propertyText, err := s.propertyContext(ctx, organizationID, message); err == nil && propertyText != "" {
		sections = append(sections, propertyText)
	}
	if historyText, err := s.recentConversationContext(ctx, conversationID, maxMessages, historySince); err == nil && historyText != "" {
		sections = append(sections, historyText)
	}

	return strings.Join(sections, "\n\n"), nil
}

func (s *Store) leadContext(ctx context.Context, organizationID string, conversationID string) (string, error) {
	var leadID string
	var name string
	var phone string
	var email string
	var city string
	var neighborhood string
	var state string
	var company string
	var profession string
	var income string
	var financing bool
	var initialMessage string
	var propertyCode string
	var valueRange string
	var targetValue string
	var stageName string
	var pipelineName string

	err := s.pool.QueryRow(ctx, `
		select
			l.id::text,
			coalesce(l.name, ''),
			coalesce(l.phone, ''),
			coalesce(l.email, ''),
			coalesce(l.cidade, ''),
			coalesce(l.bairro, ''),
			coalesce(l.uf, ''),
			coalesce(l.empresa, ''),
			coalesce(l.profissao, ''),
			coalesce(l.renda_familiar, ''),
			coalesce(l.procura_financiamento, false),
			coalesce(l.message, l.initial_message, ''),
			coalesce(l.property_code, ''),
			coalesce(l.faixa_valor_imovel, ''),
			coalesce(l.valor_interesse::text, ''),
			coalesce(st.name, ''),
			coalesce(p.name, '')
		from whatsapp_conversations wc
		join leads l on l.id = wc.lead_id
		left join stages st on st.id = l.stage_id
		left join pipelines p on p.id = l.pipeline_id
		where wc.id = $1
		  and l.organization_id = $2
	`, conversationID, organizationID).Scan(
		&leadID,
		&name,
		&phone,
		&email,
		&city,
		&neighborhood,
		&state,
		&company,
		&profession,
		&income,
		&financing,
		&initialMessage,
		&propertyCode,
		&valueRange,
		&targetValue,
		&stageName,
		&pipelineName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	var b strings.Builder
	b.WriteString("[CONTEXTO DO LEAD]\n")
	writeContextLine(&b, "Nome", name)
	writeContextLine(&b, "Telefone", phone)
	writeContextLine(&b, "Email", email)
	writeContextLine(&b, "Cidade/bairro", joinNonEmpty(", ", neighborhood, city, state))
	writeContextLine(&b, "Empresa", company)
	writeContextLine(&b, "Profissao", profession)
	writeContextLine(&b, "Renda familiar", income)
	if financing {
		b.WriteString("Busca financiamento: sim\n")
	}
	writeContextLine(&b, "Faixa de valor", valueRange)
	writeContextLine(&b, "Valor de interesse", targetValue)
	writeContextLine(&b, "Imovel de interesse", propertyCode)
	writeContextLine(&b, "Pipeline", pipelineName)
	writeContextLine(&b, "Coluna", stageName)
	writeContextLine(&b, "Mensagem inicial", truncate(initialMessage, 180))

	rows, err := s.pool.Query(ctx, `
		select
			coalesce(form_name, form_id, ''),
			coalesce(campaign_name, ''),
			coalesce(ad_name, ''),
			coalesce(contact_notes, '')
		from lead_meta
		where lead_id = $1
		order by created_at desc
		limit 1
	`, leadID)
	if err == nil {
		defer rows.Close()
		first := true
		for rows.Next() {
			var formName string
			var campaign string
			var adName string
			var notes string
			if scanErr := rows.Scan(&formName, &campaign, &adName, &notes); scanErr != nil {
				continue
			}
			if first {
				b.WriteString("\n[RESPOSTAS E ORIGEM META]\n")
				first = false
			}
			writeContextLine(&b, "Formulario", formName)
			writeContextLine(&b, "Campanha", campaign)
			writeContextLine(&b, "Anuncio", adName)
			writeContextLine(&b, "Notas do formulario", truncate(notes, 180))
		}
	}

	return strings.TrimSpace(b.String()), nil
}

func (s *Store) recentConversationContext(ctx context.Context, conversationID string, limit int, since time.Time) (string, error) {
	rows, err := s.pool.Query(ctx, `
		select coalesce(from_me, false), coalesce(content, '')
		from whatsapp_messages
		where conversation_id = $1
		  and message_type = 'text'
		  and coalesce(content, '') <> ''
		  and sent_at >= $3
		order by sent_at desc
		limit $2
	`, conversationID, limit, since)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var messages []recentMessage
	for rows.Next() {
		var msg recentMessage
		if err := rows.Scan(&msg.FromMe, &msg.Content); err != nil {
			return "", err
		}
		messages = append(messages, msg)
	}
	if len(messages) == 0 {
		return "", nil
	}

	var b strings.Builder
	b.WriteString("[HISTORICO RECENTE]\n")
	for i := len(messages) - 1; i >= 0; i-- {
		label := "Lead"
		if messages[i].FromMe {
			label = "Jhenny/equipe"
		}
		b.WriteString(label)
		b.WriteString(": ")
		b.WriteString(truncate(messages[i].Content, 180))
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String()), nil
}

func (s *Store) propertyContext(ctx context.Context, organizationID string, message string) (string, error) {
	var sections []string

	publicBaseURL, _ := s.publicSiteBaseURL(ctx, organizationID)
	if mentioned, err := s.findMentionedProperties(ctx, organizationID, message, 2); err == nil && len(mentioned) > 0 {
		attachPropertyLinks(mentioned, publicBaseURL)
		sections = append(sections, propertySection("IMOVEL CITADO NA MENSAGEM", mentioned))
		return strings.Join(sections, "\n\n"), nil
	}
	if suggestions, err := s.suggestProperties(ctx, organizationID, message, 3); err == nil && len(suggestions) > 0 {
		attachPropertyLinks(suggestions, publicBaseURL)
		sections = append(sections, propertySection("IMOVEIS PARA OFERECER", suggestions))
	}

	return strings.Join(sections, "\n\n"), nil
}

func (s *Store) publicSiteBaseURL(ctx context.Context, organizationID string) (string, error) {
	var subdomain string
	var customDomain string
	var domainVerified bool
	err := s.pool.QueryRow(ctx, `
		select
			coalesce(subdomain, ''),
			coalesce(custom_domain, ''),
			coalesce(domain_verified, false)
		from organization_sites
		where organization_id = $1
		  and is_active = true
		order by updated_at desc nulls last, created_at desc nulls last
		limit 1
	`, organizationID).Scan(&subdomain, &customDomain, &domainVerified)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if customDomain != "" && domainVerified {
		return "https://" + strings.TrimRight(customDomain, "/"), nil
	}
	if subdomain != "" {
		return "https://vimob.vettercompany.com.br/sites/" + subdomain, nil
	}
	return "", nil
}

func (s *Store) findMentionedProperties(ctx context.Context, organizationID string, message string, limit int) ([]propertySummary, error) {
	codes := extractPropertyCodes(message)
	if len(codes) == 0 {
		return nil, nil
	}
	patterns := make([]string, 0, len(codes))
	for _, code := range codes {
		patterns = append(patterns, "%"+code+"%")
	}

	rows, err := s.pool.Query(ctx, propertySummarySQL()+`
		where organization_id = $1
		  and upper(regexp_replace(coalesce(code, ''), '[^A-Z0-9]', '', 'g')) ilike any($2::text[])
		limit $3
	`, organizationID, patterns, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPropertySummaries(rows)
}

func (s *Store) suggestProperties(ctx context.Context, organizationID string, message string, limit int) ([]propertySummary, error) {
	rows, err := s.pool.Query(ctx, propertySummarySQL()+`
		where organization_id = $1
		  and lower(coalesce(status, '')) not in ('inativo', 'vendido', 'locado', 'indisponivel', 'arquivado', 'excluido')
		order by
		  (
		    case when nullif(bairro, '') is not null and lower($2) like '%' || lower(bairro) || '%' then 30 else 0 end
		    + case when nullif(cidade, '') is not null and lower($2) like '%' || lower(cidade) || '%' then 16 else 0 end
		    + case when nullif(tipo_de_imovel, '') is not null and lower($2) like '%' || lower(tipo_de_imovel) || '%' then 12 else 0 end
		    + case when nullif(tipo_de_negocio, '') is not null and lower($2) like '%' || lower(tipo_de_negocio) || '%' then 8 else 0 end
		    + case when quartos is not null and lower($2) like '%' || quartos::text || ' quarto%' then 8 else 0 end
		    + case when destaque then 4 else 0 end
		  ) desc,
		  destaque desc nulls last,
		  created_at desc
		limit $3
	`, organizationID, strings.ToLower(message), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPropertySummaries(rows)
}

func propertySummarySQL() string {
	return `
		select
			coalesce(code, ''),
			coalesce(title, ''),
			coalesce(descricao, ''),
			coalesce(tipo_de_imovel, ''),
			coalesce(tipo_de_negocio, ''),
			coalesce(bairro, ''),
			coalesce(cidade, ''),
			coalesce(uf, ''),
			coalesce(quartos::text, ''),
			coalesce(suites::text, ''),
			coalesce(banheiros::text, ''),
			coalesce(vagas::text, ''),
			coalesce(area_util::text, ''),
			coalesce(area_total::text, ''),
			coalesce(preco::text, ''),
			coalesce(valor_locacao::text, ''),
			coalesce(condominio::text, ''),
			coalesce(iptu::text, '')
		from properties
	`
}

func scanPropertySummaries(rows pgx.Rows) ([]propertySummary, error) {
	var properties []propertySummary
	for rows.Next() {
		var property propertySummary
		if err := rows.Scan(
			&property.Code,
			&property.Title,
			&property.Description,
			&property.PropertyType,
			&property.DealType,
			&property.Neighborhood,
			&property.City,
			&property.State,
			&property.Bedrooms,
			&property.Suites,
			&property.Bathrooms,
			&property.ParkingSpots,
			&property.Area,
			&property.TotalArea,
			&property.Price,
			&property.RentPrice,
			&property.CondoFee,
			&property.PropertyTax,
		); err != nil {
			return nil, err
		}
		properties = append(properties, property)
	}
	return properties, rows.Err()
}

func propertySection(title string, properties []propertySummary) string {
	var b strings.Builder
	b.WriteString("[")
	b.WriteString(title)
	b.WriteString("]\n")
	for _, property := range properties {
		b.WriteString("- ")
		b.WriteString(joinNonEmpty(" | ",
			property.Code,
			firstNonEmpty(property.Title, property.PropertyType),
			prefixIfPresent(truncate(property.Description, 120), "Descricao: "),
			joinNonEmpty(", ", property.Neighborhood, property.City, property.State),
			suffixIfPresent(property.Bedrooms, " quartos"),
			suffixIfPresent(property.Suites, " suites"),
			suffixIfPresent(property.Bathrooms, " banheiros"),
			suffixIfPresent(property.ParkingSpots, " vagas"),
			suffixIfPresent(property.Area, "m2 uteis"),
			suffixIfPresent(property.TotalArea, "m2 totais"),
			prefixIfPresent(formatCurrencyBRL(property.Price), "Venda: "),
			prefixIfPresent(formatCurrencyBRL(property.RentPrice), "Locacao: "),
			prefixIfPresent(formatCurrencyBRL(property.CondoFee), "Condominio: "),
			prefixIfPresent(formatCurrencyBRL(property.PropertyTax), "IPTU: "),
			prefixIfPresent(property.PublicURL, "Link: "),
		))
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}

func attachPropertyLinks(properties []propertySummary, publicBaseURL string) {
	publicBaseURL = strings.TrimRight(strings.TrimSpace(publicBaseURL), "/")
	if publicBaseURL == "" {
		return
	}
	for i := range properties {
		code := strings.TrimSpace(properties[i].Code)
		if code != "" {
			properties[i].PublicURL = publicBaseURL + "/imovel/" + code
		}
	}
}

var propertyCodePattern = regexp.MustCompile(`\b([A-Za-z]{1,5}\s*-?\s*\d{2,7}|\d{3,7})\b`)

func extractPropertyCodes(message string) []string {
	matches := propertyCodePattern.FindAllString(message, 8)
	result := make([]string, 0, len(matches))
	seen := make(map[string]bool)
	for _, match := range matches {
		code := strings.ToUpper(strings.Map(func(r rune) rune {
			if r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, match))
		if len(code) >= 3 && !seen[code] {
			seen[code] = true
			result = append(result, code)
		}
	}
	return result
}

func writeContextLine(b *strings.Builder, label string, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	b.WriteString(label)
	b.WriteString(": ")
	b.WriteString(value)
	b.WriteString("\n")
}

func joinNonEmpty(separator string, values ...string) string {
	var parts []string
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			parts = append(parts, strings.TrimSpace(value))
		}
	}
	return strings.Join(parts, separator)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func suffixIfPresent(value string, suffix string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return value + suffix
}

func prefixIfPresent(value string, prefix string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return prefix + value
}

func formatCurrencyBRL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil || number <= 0 {
		return value
	}
	rounded := int64(number + 0.5)
	raw := strconv.FormatInt(rounded, 10)
	var parts []string
	for len(raw) > 3 {
		parts = append([]string{raw[len(raw)-3:]}, parts...)
		raw = raw[:len(raw)-3]
	}
	parts = append([]string{raw}, parts...)
	return fmt.Sprintf("R$ %s", strings.Join(parts, "."))
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	if limit <= 3 {
		return value[:limit]
	}
	return value[:limit-3] + "..."
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

func nullIfZeroTime(value time.Time) *time.Time {
	if value.IsZero() {
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
	context_reset_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (organization_id, conversation_id)
);

alter table chatbot_conversation_state
	add column if not exists context_reset_at timestamptz;

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
