package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"vimob/backend-core/internal/config"
	"vimob/backend-core/internal/database"
)

func main() {
	ctx := context.Background()
	cfg := config.Load()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Pool.Exec(ctx, `
		create table if not exists schema_migrations (
			version text primary key,
			checksum text not null,
			applied_at timestamptz not null default now()
		)
	`); err != nil {
		log.Fatal(err)
	}

	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		log.Fatal(err)
	}
	sort.Strings(files)

	for _, file := range files {
		version := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		content, err := os.ReadFile(file)
		if err != nil {
			log.Fatal(err)
		}
		checksum := checksum(content)

		var exists bool
		if err := db.Pool.QueryRow(ctx, `
			select exists(select 1 from schema_migrations where version = $1)
		`, version).Scan(&exists); err != nil {
			log.Fatal(err)
		}
		if exists {
			log.Printf("skip %s", version)
			continue
		}

		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			log.Fatal(err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			log.Fatalf("apply %s: %v", version, err)
		}
		if _, err := tx.Exec(ctx, `
			insert into schema_migrations (version, checksum)
			values ($1, $2)
		`, version, checksum); err != nil {
			_ = tx.Rollback(ctx)
			log.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			log.Fatal(err)
		}
		log.Printf("applied %s", version)
	}
}

func checksum(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
