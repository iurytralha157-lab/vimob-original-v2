package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr          string
	DatabaseURL       string
	WorkerID          string
	WorkerTypes       []string
	PollInterval      time.Duration
	BatchSize         int
	AgentServiceURL   string
	LumiBaseURL       string
	LumiInstanceKey   string
	LumiWebhookSecret string
}

func Load() Config {
	return Config{
		HTTPAddr:          env("BACKEND_CORE_ADDR", ":8090"),
		DatabaseURL:       env("DATABASE_URL", ""),
		WorkerID:          env("WORKER_ID", hostname()),
		WorkerTypes:       splitList(env("WORKER_TYPES", "events,rules,scheduler,memory,agent,outbox,campaigns,notifications")),
		PollInterval:      time.Duration(envInt("WORKER_POLL_INTERVAL_MS", 1500)) * time.Millisecond,
		BatchSize:         envInt("WORKER_BATCH_SIZE", 10),
		AgentServiceURL:   env("AGENT_SERVICE_URL", ""),
		LumiBaseURL:       env("LUMI_BASE_URL", "https://lume-io.com"),
		LumiInstanceKey:   env("LUMI_INSTANCE_KEY", ""),
		LumiWebhookSecret: env("LUMI_WEBHOOK_SECRET", ""),
	}
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitList(value string) []string {
	var result []string
	var current []rune
	for _, r := range value {
		if r == ',' {
			if len(current) > 0 {
				result = append(result, string(current))
				current = current[:0]
			}
			continue
		}
		if r != ' ' && r != '\t' && r != '\n' {
			current = append(current, r)
		}
	}
	if len(current) > 0 {
		result = append(result, string(current))
	}
	return result
}

func hostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "worker-local"
	}
	return name
}
