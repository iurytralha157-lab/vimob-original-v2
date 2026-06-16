package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	server := &http.Server{
		Addr:              deps.Config.HTTPAddr,
		Handler:           deps.Router(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		deps.Logger.Info("api listening", "addr", deps.Config.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			deps.Logger.Error("api failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
