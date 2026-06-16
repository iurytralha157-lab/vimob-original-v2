package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"vimob/backend-core/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	deps, err := app.Build(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer deps.Close()

	group := deps.WorkerGroup()
	if err := group.Start(ctx); err != nil {
		deps.Logger.Error("worker group failed", "error", err)
	}
}
