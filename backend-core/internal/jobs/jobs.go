package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Job struct {
	ID             string          `json:"id"`
	OrganizationID string          `json:"organization_id"`
	Type           string          `json:"type"`
	RefID          string          `json:"ref_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	Attempts       int             `json:"attempts"`
	MaxAttempts    int             `json:"max_attempts"`
}

type EnqueueInput struct {
	OrganizationID string
	Type           string
	RefID          string
	Payload        json.RawMessage
	Priority       int
	ScheduledAt    time.Time
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Enqueue(ctx context.Context, input EnqueueInput) (*Job, error) {
	if input.OrganizationID == "" {
		return nil, errors.New("organization_id is required")
	}
	if input.Type == "" {
		return nil, errors.New("job type is required")
	}
	if input.Priority == 0 {
		input.Priority = 5
	}
	if input.ScheduledAt.IsZero() {
		input.ScheduledAt = time.Now().UTC()
	}
	payload := input.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	var job Job
	err := r.pool.QueryRow(ctx, `
		insert into jobs (organization_id, type, ref_id, payload, priority, scheduled_at)
		values ($1,$2,nullif($3, '')::uuid,$4,$5,$6)
		returning id, organization_id, type, coalesce(ref_id::text, ''), payload, attempts, max_attempts
	`, input.OrganizationID, input.Type, input.RefID, payload, input.Priority, input.ScheduledAt).Scan(
		&job.ID,
		&job.OrganizationID,
		&job.Type,
		&job.RefID,
		&job.Payload,
		&job.Attempts,
		&job.MaxAttempts,
	)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *Repository) Claim(ctx context.Context, workerID string, jobTypes []string, limit int) ([]Job, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx, `
		with claimed as (
			select id
			from jobs
			where status = 'pending'
			  and scheduled_at <= now()
			  and type = any($1)
			order by priority desc, scheduled_at asc
			for update skip locked
			limit $2
		)
		update jobs j
		set status = 'processing',
		    locked_at = now(),
		    locked_by = $3,
		    attempts = attempts + 1,
		    updated_at = now()
		from claimed
		where j.id = claimed.id
		returning j.id, j.organization_id, j.type, coalesce(j.ref_id::text, ''), j.payload, j.attempts, j.max_attempts
	`, jobTypes, limit, workerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Job
	for rows.Next() {
		var job Job
		if err := rows.Scan(&job.ID, &job.OrganizationID, &job.Type, &job.RefID, &job.Payload, &job.Attempts, &job.MaxAttempts); err != nil {
			return nil, err
		}
		result = append(result, job)
	}
	return result, rows.Err()
}

func (r *Repository) Complete(ctx context.Context, jobID string) error {
	_, err := r.pool.Exec(ctx, `
		update jobs
		set status = 'completed',
		    locked_at = null,
		    locked_by = null,
		    updated_at = now()
		where id = $1
	`, jobID)
	return err
}

func (r *Repository) Fail(ctx context.Context, job Job, cause error) error {
	status := "pending"
	if job.Attempts >= job.MaxAttempts {
		status = "failed"
	}
	nextRetry := time.Now().UTC().Add(time.Duration(job.Attempts) * time.Minute)
	_, err := r.pool.Exec(ctx, `
		update jobs
		set status = $2,
		    locked_at = null,
		    locked_by = null,
		    scheduled_at = case when $2 = 'pending' then $3 else scheduled_at end,
		    last_error = $4,
		    updated_at = now()
		where id = $1
	`, job.ID, status, nextRetry, cause.Error())
	return err
}

func (r *Repository) Get(ctx context.Context, jobID string) (*Job, error) {
	var job Job
	err := r.pool.QueryRow(ctx, `
		select id, organization_id, type, coalesce(ref_id::text, ''), payload, attempts, max_attempts
		from jobs
		where id = $1
	`, jobID).Scan(&job.ID, &job.OrganizationID, &job.Type, &job.RefID, &job.Payload, &job.Attempts, &job.MaxAttempts)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &job, nil
}
