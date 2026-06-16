package repositories

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"vimob/backend-core/internal/domain"
)

type Repositories struct {
	Organizations *OrganizationRepository
	Customers     *CustomerRepository
	Conversations *ConversationRepository
	Messages      *ConversationMessageRepository
	Leads         *LeadRepository
	Events        *EventRepository
	Tasks         *TaskRepository
	Campaigns     *CampaignRepository
	Outbox        *OutboxRepository
	Memory        *MemoryRepository
	Scheduler     *SchedulerRepository
	Occurrences   *RuleOccurrenceRepository
}

func New(pool *pgxpool.Pool) *Repositories {
	return &Repositories{
		Organizations: &OrganizationRepository{pool: pool},
		Customers:     &CustomerRepository{pool: pool},
		Conversations: &ConversationRepository{pool: pool},
		Messages:      &ConversationMessageRepository{pool: pool},
		Leads:         &LeadRepository{pool: pool},
		Events:        &EventRepository{pool: pool},
		Tasks:         &TaskRepository{pool: pool},
		Campaigns:     &CampaignRepository{pool: pool},
		Outbox:        &OutboxRepository{pool: pool},
		Memory:        &MemoryRepository{pool: pool},
		Scheduler:     &SchedulerRepository{pool: pool},
		Occurrences:   &RuleOccurrenceRepository{pool: pool},
	}
}

type OrganizationRepository struct {
	pool *pgxpool.Pool
}

func (r *OrganizationRepository) Create(ctx context.Context, name string) (*domain.Organization, error) {
	var org domain.Organization
	err := r.pool.QueryRow(ctx, `
		insert into organizations (name)
		values ($1)
		returning id, name, created_at, updated_at
	`, name).Scan(&org.ID, &org.Name, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &org, nil
}

func (r *OrganizationRepository) Get(ctx context.Context, id string) (*domain.Organization, error) {
	var org domain.Organization
	err := r.pool.QueryRow(ctx, `
		select id, name, created_at, updated_at
		from organizations
		where id = $1
	`, id).Scan(&org.ID, &org.Name, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &org, nil
}

type CustomerRepository struct {
	pool *pgxpool.Pool
}

type UpsertCustomerInput struct {
	OrganizationID     string
	RegistrySource     string
	RegistryID         string
	RegistryIDOriginal string
	DisplayName        string
	PhoneE164          string
	Metadata           json.RawMessage
}

func (r *CustomerRepository) UpsertByRegistry(ctx context.Context, input UpsertCustomerInput) (*domain.Customer, error) {
	source := defaultString(input.RegistrySource, "whatsapp")
	metadata := defaultJSON(input.Metadata)
	var customer domain.Customer
	err := r.pool.QueryRow(ctx, `
		insert into customers (
			organization_id, registry_source, registry_id, registry_id_original,
			display_name, phone_e164, metadata
		)
		values ($1,$2,$3,$4,$5,$6,$7)
		on conflict (organization_id, registry_source, registry_id) do update set
			registry_id_original = coalesce(nullif(excluded.registry_id_original, ''), customers.registry_id_original),
			display_name = coalesce(nullif(excluded.display_name, ''), customers.display_name),
			phone_e164 = coalesce(nullif(excluded.phone_e164, ''), customers.phone_e164),
			metadata = customers.metadata || excluded.metadata,
			updated_at = now()
		returning id, organization_id, registry_source, registry_id, display_name, phone_e164, metadata, created_at, updated_at
	`, input.OrganizationID, source, input.RegistryID, input.RegistryIDOriginal, input.DisplayName, input.PhoneE164, metadata).Scan(
		&customer.ID,
		&customer.OrganizationID,
		&customer.RegistrySource,
		&customer.RegistryID,
		&customer.DisplayName,
		&customer.PhoneE164,
		&customer.Metadata,
		&customer.CreatedAt,
		&customer.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

type ConversationRepository struct {
	pool *pgxpool.Pool
}

func (r *ConversationRepository) EnsureActive(ctx context.Context, organizationID string, customerID string, registryID string) (*domain.Conversation, error) {
	var existing domain.Conversation
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, customer_id, registry_id, status, created_at, updated_at
		from conversations
		where organization_id = $1
		  and customer_id = $2
		  and status not in ('closed')
		order by updated_at desc
		limit 1
	`, organizationID, customerID).Scan(
		&existing.ID,
		&existing.OrganizationID,
		&existing.CustomerID,
		&existing.RegistryID,
		&existing.Status,
		&existing.CreatedAt,
		&existing.UpdatedAt,
	)
	if err == nil {
		return &existing, nil
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}

	var conversation domain.Conversation
	err = r.pool.QueryRow(ctx, `
		insert into conversations (organization_id, customer_id, registry_id)
		values ($1,$2,$3)
		returning id, organization_id, customer_id, registry_id, status, created_at, updated_at
	`, organizationID, customerID, registryID).Scan(
		&conversation.ID,
		&conversation.OrganizationID,
		&conversation.CustomerID,
		&conversation.RegistryID,
		&conversation.Status,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &conversation, nil
}

func (r *ConversationRepository) Restart(ctx context.Context, conversationID string) error {
	_, err := r.pool.Exec(ctx, `
		update conversations
		set status = 'restarted', updated_at = now()
		where id = $1
	`, conversationID)
	return err
}

type ConversationMessageRepository struct {
	pool *pgxpool.Pool
}

type CreateConversationMessageInput struct {
	OrganizationID string
	ConversationID string
	CustomerID     string
	Direction      string
	Content        string
	Payload        json.RawMessage
}

func (r *ConversationMessageRepository) Create(ctx context.Context, input CreateConversationMessageInput) (*domain.ConversationMessage, error) {
	var message domain.ConversationMessage
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	err = tx.QueryRow(ctx, `
		insert into conversation_messages (
			organization_id, conversation_id, customer_id, direction, content, payload
		)
		values ($1,$2,$3,$4,$5,$6)
		returning id, organization_id, conversation_id, customer_id, direction, content, payload, created_at
	`, input.OrganizationID, input.ConversationID, input.CustomerID, defaultString(input.Direction, "inbound"), input.Content, defaultJSON(input.Payload)).Scan(
		&message.ID,
		&message.OrganizationID,
		&message.ConversationID,
		&message.CustomerID,
		&message.Direction,
		&message.Content,
		&message.Payload,
		&message.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if _, err = tx.Exec(ctx, `
		update conversations
		set updated_at = now()
		where id = $1
	`, input.ConversationID); err != nil {
		return nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &message, nil
}

func (r *ConversationMessageRepository) CountByConversation(ctx context.Context, organizationID string, conversationID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		select count(*)
		from conversation_messages
		where organization_id = $1
		  and conversation_id = $2
	`, organizationID, conversationID).Scan(&count)
	return count, err
}

func (r *ConversationMessageRepository) ListRecentByConversation(ctx context.Context, organizationID string, conversationID string, limit int) ([]domain.ConversationMessage, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, `
		with recent as (
			select id, organization_id, conversation_id, customer_id, direction, content, payload, created_at
			from conversation_messages
			where organization_id = $1
			  and conversation_id = $2
			order by created_at desc
			limit $3
		)
		select id, organization_id, conversation_id, customer_id, direction, content, payload, created_at
		from recent
		order by created_at asc
	`, organizationID, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []domain.ConversationMessage
	for rows.Next() {
		var message domain.ConversationMessage
		if err := rows.Scan(
			&message.ID,
			&message.OrganizationID,
			&message.ConversationID,
			&message.CustomerID,
			&message.Direction,
			&message.Content,
			&message.Payload,
			&message.CreatedAt,
		); err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

type LeadRepository struct {
	pool *pgxpool.Pool
}

type CreateLeadInput struct {
	OrganizationID string
	CustomerID     string
	Name           string
	Status         string
	Metadata       json.RawMessage
}

func (r *LeadRepository) Create(ctx context.Context, input CreateLeadInput) (*domain.Lead, error) {
	status := defaultString(input.Status, "new")
	var lead domain.Lead
	err := r.pool.QueryRow(ctx, `
		insert into leads (organization_id, customer_id, name, status, metadata)
		values ($1, nullif($2, '')::uuid, $3, $4, $5)
		returning id, organization_id, coalesce(customer_id::text, ''), name, status, created_at, updated_at
	`, input.OrganizationID, input.CustomerID, input.Name, status, defaultJSON(input.Metadata)).Scan(
		&lead.ID,
		&lead.OrganizationID,
		&lead.CustomerID,
		&lead.Name,
		&lead.Status,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &lead, nil
}

func (r *LeadRepository) Get(ctx context.Context, id string) (*domain.Lead, error) {
	var lead domain.Lead
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, coalesce(customer_id::text, ''), name, status, created_at, updated_at
		from leads
		where id = $1
	`, id).Scan(
		&lead.ID,
		&lead.OrganizationID,
		&lead.CustomerID,
		&lead.Name,
		&lead.Status,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &lead, nil
}

type MemoryRepository struct {
	pool *pgxpool.Pool
}

func (r *MemoryRepository) EnsureState(ctx context.Context, organizationID string, customerID string, registryID string, conversationID string) (*domain.ConversationAIState, error) {
	var state domain.ConversationAIState
	err := r.pool.QueryRow(ctx, `
		insert into conversation_ai_state (
			organization_id, customer_id, registry_id, conversation_id
		)
		values ($1,$2,$3,$4)
		on conflict (organization_id, registry_id) do update set
			customer_id = excluded.customer_id,
			conversation_id = excluded.conversation_id,
			updated_at = now()
		returning id, organization_id, customer_id, registry_id, conversation_id, status,
		          coalesce(last_response_id, ''), context_version, summary, memory, updated_at
	`, organizationID, customerID, registryID, conversationID).Scan(
		&state.ID,
		&state.OrganizationID,
		&state.CustomerID,
		&state.RegistryID,
		&state.ConversationID,
		&state.Status,
		&state.LastResponseID,
		&state.ContextVersion,
		&state.Summary,
		&state.Memory,
		&state.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &state, nil
}

func (r *MemoryRepository) GetByConversation(ctx context.Context, organizationID string, conversationID string) (*domain.ConversationAIState, error) {
	var state domain.ConversationAIState
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, customer_id, registry_id, coalesce(conversation_id::text, ''),
		       status, coalesce(last_response_id, ''), context_version, summary, memory, updated_at
		from conversation_ai_state
		where organization_id = $1
		  and conversation_id = $2
	`, organizationID, conversationID).Scan(
		&state.ID,
		&state.OrganizationID,
		&state.CustomerID,
		&state.RegistryID,
		&state.ConversationID,
		&state.Status,
		&state.LastResponseID,
		&state.ContextVersion,
		&state.Summary,
		&state.Memory,
		&state.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &state, nil
}

func (r *MemoryRepository) GetByRegistry(ctx context.Context, organizationID string, registryID string) (*domain.ConversationAIState, error) {
	if registryID == "" {
		return nil, nil
	}
	var state domain.ConversationAIState
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, customer_id, registry_id, coalesce(conversation_id::text, ''),
		       status, coalesce(last_response_id, ''), context_version, summary, memory, updated_at
		from conversation_ai_state
		where organization_id = $1
		  and registry_id = $2
	`, organizationID, registryID).Scan(
		&state.ID,
		&state.OrganizationID,
		&state.CustomerID,
		&state.RegistryID,
		&state.ConversationID,
		&state.Status,
		&state.LastResponseID,
		&state.ContextVersion,
		&state.Summary,
		&state.Memory,
		&state.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &state, nil
}

func (r *MemoryRepository) UpdatePrepared(ctx context.Context, stateID string, summary string, memory json.RawMessage) (*domain.ConversationAIState, error) {
	var state domain.ConversationAIState
	err := r.pool.QueryRow(ctx, `
		update conversation_ai_state
		set summary = $2,
		    memory = $3,
		    status = 'active',
		    updated_at = now()
		where id = $1
		returning id, organization_id, customer_id, registry_id, coalesce(conversation_id::text, ''),
		          status, coalesce(last_response_id, ''), context_version, summary, memory, updated_at
	`, stateID, summary, defaultJSON(memory)).Scan(
		&state.ID,
		&state.OrganizationID,
		&state.CustomerID,
		&state.RegistryID,
		&state.ConversationID,
		&state.Status,
		&state.LastResponseID,
		&state.ContextVersion,
		&state.Summary,
		&state.Memory,
		&state.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &state, nil
}

func (r *MemoryRepository) RestartByRegistry(ctx context.Context, organizationID string, registryID string) error {
	_, err := r.pool.Exec(ctx, `
		update conversation_ai_state
		set last_response_id = null,
		    context_reset_at = now(),
		    context_version = context_version + 1,
		    status = 'restarted',
		    updated_at = now()
		where organization_id = $1
		  and registry_id = $2
	`, organizationID, registryID)
	return err
}

type EventRepository struct {
	pool *pgxpool.Pool
}

func (r *EventRepository) Insert(ctx context.Context, eventType string, organizationID string, registryID string, payload json.RawMessage) (*domain.Event, error) {
	var event domain.Event
	err := r.pool.QueryRow(ctx, `
		insert into events (organization_id, type, registry_id, payload)
		values ($1,$2,$3,$4)
		returning id, organization_id, type, registry_id, payload, created_at
	`, organizationID, eventType, registryID, defaultJSON(payload)).Scan(
		&event.ID,
		&event.OrganizationID,
		&event.Type,
		&event.RegistryID,
		&event.Payload,
		&event.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *EventRepository) Get(ctx context.Context, id string) (*domain.Event, error) {
	var event domain.Event
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, type, registry_id, payload, created_at
		from events
		where id = $1
	`, id).Scan(
		&event.ID,
		&event.OrganizationID,
		&event.Type,
		&event.RegistryID,
		&event.Payload,
		&event.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &event, nil
}

type TaskRepository struct {
	pool *pgxpool.Pool
}

func (r *TaskRepository) Create(ctx context.Context, organizationID string, title string, payload json.RawMessage) (*domain.Task, error) {
	return r.CreateDetailed(ctx, CreateTaskDetailedInput{
		OrganizationID: organizationID,
		Title:          title,
		Payload:        payload,
	})
}

type CreateTaskDetailedInput struct {
	OrganizationID string
	LeadID         string
	CustomerID     string
	Title          string
	DueAt          time.Time
	Payload        json.RawMessage
}

func (r *TaskRepository) CreateDetailed(ctx context.Context, input CreateTaskDetailedInput) (*domain.Task, error) {
	var task domain.Task
	err := r.pool.QueryRow(ctx, `
		insert into tasks (organization_id, lead_id, customer_id, title, due_at, payload)
		values (
			$1,
			nullif($2, '')::uuid,
			nullif($3, '')::uuid,
			$4,
			case when $5 = '0001-01-01 00:00:00+00'::timestamptz then null else $5 end,
			$6
		)
		returning id, organization_id, coalesce(lead_id::text, ''), coalesce(customer_id::text, ''),
		          title, status, due_at, payload, created_at
	`, input.OrganizationID, input.LeadID, input.CustomerID, input.Title, input.DueAt, defaultJSON(input.Payload)).Scan(
		&task.ID,
		&task.OrganizationID,
		&task.LeadID,
		&task.CustomerID,
		&task.Title,
		&task.Status,
		&task.DueAt,
		&task.Payload,
		&task.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &task, nil
}

type CampaignRepository struct {
	pool *pgxpool.Pool
}

func (r *CampaignRepository) Create(ctx context.Context, organizationID string, name string, payload json.RawMessage) (*domain.Campaign, error) {
	var campaign domain.Campaign
	err := r.pool.QueryRow(ctx, `
		insert into campaigns (organization_id, name, payload)
		values ($1,$2,$3)
		returning id, organization_id, name, status, payload, created_at
	`, organizationID, name, defaultJSON(payload)).Scan(
		&campaign.ID,
		&campaign.OrganizationID,
		&campaign.Name,
		&campaign.Status,
		&campaign.Payload,
		&campaign.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &campaign, nil
}

func (r *CampaignRepository) Get(ctx context.Context, id string) (*domain.Campaign, error) {
	var campaign domain.Campaign
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, name, status, payload, created_at
		from campaigns
		where id = $1
	`, id).Scan(
		&campaign.ID,
		&campaign.OrganizationID,
		&campaign.Name,
		&campaign.Status,
		&campaign.Payload,
		&campaign.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &campaign, nil
}

func (r *CampaignRepository) UpdateStatus(ctx context.Context, id string, status string) error {
	_, err := r.pool.Exec(ctx, `
		update campaigns
		set status = $2,
		    updated_at = now()
		where id = $1
	`, id, status)
	return err
}

type OutboxRepository struct {
	pool *pgxpool.Pool
}

func (r *OutboxRepository) Create(ctx context.Context, organizationID string, channel string, recipient string, payload json.RawMessage, scheduledAt time.Time) (*domain.OutboxMessage, error) {
	if scheduledAt.IsZero() {
		scheduledAt = time.Now().UTC()
	}
	var message domain.OutboxMessage
	err := r.pool.QueryRow(ctx, `
		insert into outbox_messages (organization_id, channel, recipient, payload, scheduled_at)
		values ($1,$2,$3,$4,$5)
		returning id, organization_id, coalesce(campaign_id::text, ''), channel, recipient, payload, status, attempts, max_attempts,
		          provider_message_id, coalesce(last_error, ''), scheduled_at, sent_at, created_at
	`, organizationID, channel, recipient, defaultJSON(payload), scheduledAt).Scan(
		&message.ID,
		&message.OrganizationID,
		&message.CampaignID,
		&message.Channel,
		&message.Recipient,
		&message.Payload,
		&message.Status,
		&message.Attempts,
		&message.MaxAttempts,
		&message.ProviderMessageID,
		&message.LastError,
		&message.ScheduledAt,
		&message.SentAt,
		&message.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &message, nil
}

type CreateOutboxForCampaignInput struct {
	OrganizationID string
	CampaignID     string
	Channel        string
	Recipient      string
	Payload        json.RawMessage
	ScheduledAt    time.Time
}

func (r *OutboxRepository) CreateForCampaignOnce(ctx context.Context, input CreateOutboxForCampaignInput) (*domain.OutboxMessage, bool, error) {
	if input.ScheduledAt.IsZero() {
		input.ScheduledAt = time.Now().UTC()
	}
	message, err := r.insertOutboxForCampaign(ctx, input)
	if err == nil {
		return message, true, nil
	}
	if err != pgx.ErrNoRows {
		return nil, false, err
	}
	existing, err := r.GetByCampaignRecipient(ctx, input.CampaignID, input.Channel, input.Recipient)
	if err != nil {
		return nil, false, err
	}
	return existing, false, nil
}

func (r *OutboxRepository) insertOutboxForCampaign(ctx context.Context, input CreateOutboxForCampaignInput) (*domain.OutboxMessage, error) {
	var message domain.OutboxMessage
	err := r.pool.QueryRow(ctx, `
		insert into outbox_messages (
			organization_id, campaign_id, channel, recipient, payload, scheduled_at
		)
		values ($1,$2,$3,$4,$5,$6)
		on conflict do nothing
		returning id, organization_id, coalesce(campaign_id::text, ''), channel, recipient, payload, status, attempts, max_attempts,
		          provider_message_id, coalesce(last_error, ''), scheduled_at, sent_at, created_at
	`, input.OrganizationID, input.CampaignID, input.Channel, input.Recipient, defaultJSON(input.Payload), input.ScheduledAt).Scan(
		&message.ID,
		&message.OrganizationID,
		&message.CampaignID,
		&message.Channel,
		&message.Recipient,
		&message.Payload,
		&message.Status,
		&message.Attempts,
		&message.MaxAttempts,
		&message.ProviderMessageID,
		&message.LastError,
		&message.ScheduledAt,
		&message.SentAt,
		&message.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &message, nil
}

func (r *OutboxRepository) GetByCampaignRecipient(ctx context.Context, campaignID string, channel string, recipient string) (*domain.OutboxMessage, error) {
	var message domain.OutboxMessage
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, coalesce(campaign_id::text, ''), channel, recipient, payload, status, attempts, max_attempts,
		       provider_message_id, coalesce(last_error, ''), scheduled_at, sent_at, created_at
		from outbox_messages
		where campaign_id = $1
		  and channel = $2
		  and recipient = $3
	`, campaignID, channel, recipient).Scan(
		&message.ID,
		&message.OrganizationID,
		&message.CampaignID,
		&message.Channel,
		&message.Recipient,
		&message.Payload,
		&message.Status,
		&message.Attempts,
		&message.MaxAttempts,
		&message.ProviderMessageID,
		&message.LastError,
		&message.ScheduledAt,
		&message.SentAt,
		&message.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &message, nil
}

func (r *OutboxRepository) Get(ctx context.Context, id string) (*domain.OutboxMessage, error) {
	var message domain.OutboxMessage
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, coalesce(campaign_id::text, ''), channel, recipient, payload, status, attempts, max_attempts,
		       provider_message_id, coalesce(last_error, ''), scheduled_at, sent_at, created_at
		from outbox_messages
		where id = $1
	`, id).Scan(
		&message.ID,
		&message.OrganizationID,
		&message.CampaignID,
		&message.Channel,
		&message.Recipient,
		&message.Payload,
		&message.Status,
		&message.Attempts,
		&message.MaxAttempts,
		&message.ProviderMessageID,
		&message.LastError,
		&message.ScheduledAt,
		&message.SentAt,
		&message.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &message, nil
}

func (r *OutboxRepository) MarkProcessing(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		update outbox_messages
		set status = 'processing',
		    attempts = attempts + 1,
		    locked_at = now(),
		    updated_at = now()
		where id = $1
		  and status in ('pending', 'failed')
		  and attempts < max_attempts
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("outbox message is not sendable")
	}
	return err
}

func (r *OutboxRepository) MarkSent(ctx context.Context, id string, providerMessageID string) error {
	_, err := r.pool.Exec(ctx, `
		update outbox_messages
		set status = 'sent',
		    provider_message_id = $2,
		    sent_at = now(),
		    locked_at = null,
		    last_error = null,
		    updated_at = now()
		where id = $1
	`, id, providerMessageID)
	return err
}

func (r *OutboxRepository) MarkFailed(ctx context.Context, id string, cause error) error {
	status := "pending"
	var maxAttempts int
	var attempts int
	_ = r.pool.QueryRow(ctx, `
		select attempts, max_attempts
		from outbox_messages
		where id = $1
	`, id).Scan(&attempts, &maxAttempts)
	if attempts >= maxAttempts {
		status = "failed"
	}
	_, err := r.pool.Exec(ctx, `
		update outbox_messages
		set status = $2,
		    locked_at = null,
		    scheduled_at = case when $2 = 'pending' then now() + interval '1 minute' else scheduled_at end,
		    last_error = $3,
		    updated_at = now()
		where id = $1
	`, id, status, cause.Error())
	return err
}

type SchedulerRepository struct {
	pool *pgxpool.Pool
}

func (r *SchedulerRepository) ListNoReplyCandidates(ctx context.Context, cutoff time.Time, limit int) ([]domain.NoReplyCandidate, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		select s.organization_id::text,
		       s.registry_id,
		       s.conversation_id::text,
		       s.customer_id::text,
		       c.updated_at,
		       greatest(7, floor(extract(epoch from (now() - c.updated_at)) / 86400)::int) as days_inactive
		from conversation_ai_state s
		join conversations c on c.id = s.conversation_id
		where c.status not in ('closed')
		  and c.updated_at <= $1
		  and not exists (
		    select 1
		    from events e
		    where e.organization_id = s.organization_id
		      and e.registry_id = s.registry_id
		      and e.type in ('message.received', 'conversation.message.received', 'whatsapp.message.received')
		      and e.created_at > c.updated_at
		  )
		order by c.updated_at asc
		limit $2
	`, cutoff, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []domain.NoReplyCandidate
	for rows.Next() {
		var candidate domain.NoReplyCandidate
		if err := rows.Scan(
			&candidate.OrganizationID,
			&candidate.RegistryID,
			&candidate.ConversationID,
			&candidate.CustomerID,
			&candidate.LastActivityAt,
			&candidate.DaysInactive,
		); err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}

func (r *SchedulerRepository) ListStoppedBuyingCandidates(ctx context.Context, cutoff time.Time, limit int) ([]domain.StoppedBuyingCandidate, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		with purchases as (
			select organization_id,
			       registry_id,
			       max(created_at) as last_purchase_at
			from events
			where type in ('purchase.completed', 'order.completed', 'customer.purchase_completed')
			  and registry_id <> ''
			group by organization_id, registry_id
		)
		select organization_id::text,
		       registry_id,
		       last_purchase_at,
		       greatest(30, floor(extract(epoch from (now() - last_purchase_at)) / 86400)::int) as days_inactive
		from purchases
		where last_purchase_at <= $1
		order by last_purchase_at asc
		limit $2
	`, cutoff, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []domain.StoppedBuyingCandidate
	for rows.Next() {
		var candidate domain.StoppedBuyingCandidate
		if err := rows.Scan(
			&candidate.OrganizationID,
			&candidate.RegistryID,
			&candidate.LastPurchaseAt,
			&candidate.DaysInactive,
		); err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}

type RuleOccurrenceRepository struct {
	pool *pgxpool.Pool
}

type CreateRuleOccurrenceInput struct {
	OrganizationID string
	RuleKey        string
	RegistryID     string
	OccurrenceKey  string
	RefID          string
	Payload        json.RawMessage
}

func (r *RuleOccurrenceRepository) CreateOnce(ctx context.Context, input CreateRuleOccurrenceInput) (*domain.RuleOccurrence, bool, error) {
	var occurrence domain.RuleOccurrence
	err := r.pool.QueryRow(ctx, `
		insert into rule_occurrences (
			organization_id, rule_key, registry_id, occurrence_key, ref_id, payload
		)
		values ($1,$2,$3,$4,nullif($5, '')::uuid,$6)
		on conflict (organization_id, rule_key, registry_id, occurrence_key) do nothing
		returning id, organization_id, rule_key, registry_id, occurrence_key, coalesce(ref_id::text, ''), payload, created_at
	`, input.OrganizationID, input.RuleKey, input.RegistryID, input.OccurrenceKey, input.RefID, defaultJSON(input.Payload)).Scan(
		&occurrence.ID,
		&occurrence.OrganizationID,
		&occurrence.RuleKey,
		&occurrence.RegistryID,
		&occurrence.OccurrenceKey,
		&occurrence.RefID,
		&occurrence.Payload,
		&occurrence.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &occurrence, true, nil
}

func (r *RuleOccurrenceRepository) Delete(ctx context.Context, id string) error {
	if id == "" {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		delete from rule_occurrences
		where id = $1
	`, id)
	return err
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func defaultJSON(value json.RawMessage) json.RawMessage {
	if len(value) == 0 {
		return json.RawMessage(`{}`)
	}
	return value
}
