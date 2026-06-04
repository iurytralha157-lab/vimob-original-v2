package config

import (
	"os"
	"strconv"
)

type Config struct {
	Addr          string
	DatabaseURL   string
	BuntDBPath    string
	WorkerCount   int
	WebhookSecret string
	OpenAIKey     string
	DefaultModel  string
}

func Load() Config {
	return Config{
		Addr:          env("VIMOB_BACKEND_ADDR", ":8088"),
		DatabaseURL:   env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/vimob?sslmode=disable"),
		BuntDBPath:    env("BUNTDB_PATH", "./data/chatbot-cache.db"),
		WorkerCount:   envInt("WORKER_COUNT", 4),
		WebhookSecret: env("VIMOB_WEBHOOK_SECRET", ""),
		OpenAIKey:     env("OPENAI_API_KEY", ""),
		DefaultModel:  env("OPENAI_DEFAULT_MODEL", "gpt-4.1-nano"),
	}
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return fallback
	}
	return value
}
