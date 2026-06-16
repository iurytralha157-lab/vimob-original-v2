include .env.example
-include .env
-include $(ENV_FILE)

export

.PHONY: test build db-up migrate api worker worker-memory worker-events worker-rules worker-outbox

test:
	go test ./...

build:
	go build -o /tmp/backend-core-api ./cmd/api
	go build -o /tmp/backend-core-worker ./cmd/worker
	go build -o /tmp/backend-core-migrate ./cmd/migrate

db-up:
	docker compose -f docker-compose.local.yml up -d postgres

migrate:
	go run ./cmd/migrate

api:
	go run ./cmd/api

worker:
	go run ./cmd/worker

worker-memory:
	WORKER_TYPES=memory go run ./cmd/worker

worker-events:
	WORKER_TYPES=events go run ./cmd/worker

worker-rules:
	WORKER_TYPES=rules go run ./cmd/worker

worker-outbox:
	WORKER_TYPES=outbox go run ./cmd/worker
