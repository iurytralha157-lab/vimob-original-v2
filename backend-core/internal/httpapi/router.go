package httpapi

import (
	"net/http"

	"vimob/backend-core/internal/controllers"
)

func NewRouter(ctrl *controllers.Controllers) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", ctrl.Health.Health)
	mux.HandleFunc("POST /v1/organizations", ctrl.Organizations.Create)
	mux.HandleFunc("GET /v1/organizations/{id}", ctrl.Organizations.Get)
	mux.HandleFunc("POST /v1/leads", ctrl.Leads.Create)
	mux.HandleFunc("GET /v1/leads/{id}", ctrl.Leads.Get)
	mux.HandleFunc("POST /v1/events", ctrl.Events.Create)
	mux.HandleFunc("POST /v1/webhooks/lumi/{organization_id}", ctrl.Webhooks.Lumi)
	mux.HandleFunc("POST /v1/conversations/messages", ctrl.Conversations.IngestMessage)
	mux.HandleFunc("POST /v1/conversations/restart", ctrl.Conversations.Restart)
	mux.HandleFunc("POST /v1/memory/ensure", ctrl.Memory.Ensure)
	mux.HandleFunc("POST /v1/tasks", ctrl.Tasks.Create)
	mux.HandleFunc("POST /v1/campaigns", ctrl.Campaigns.Create)
	mux.HandleFunc("POST /v1/outbox", ctrl.Outbox.Create)

	return withCORS(mux)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "authorization, content-type, x-api-key, x-lumi-webhook-secret, x-webhook-secret")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
