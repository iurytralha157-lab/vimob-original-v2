package controllers

import (
	"encoding/json"
	"io"
	"net/http"

	"vimob/backend-core/internal/respond"
	"vimob/backend-core/internal/services"
)

type Controllers struct {
	Health        *HealthController
	Organizations *OrganizationsController
	Leads         *LeadsController
	Events        *EventsController
	Conversations *ConversationsController
	Webhooks      *WebhooksController
	Tasks         *TasksController
	Campaigns     *CampaignsController
	Outbox        *OutboxController
	Memory        *MemoryController
}

func New(svc *services.Services) *Controllers {
	return &Controllers{
		Health:        &HealthController{},
		Organizations: &OrganizationsController{organizations: svc.Organizations},
		Leads:         &LeadsController{leads: svc.Leads},
		Events:        &EventsController{events: svc.Events},
		Conversations: &ConversationsController{conversations: svc.Conversations},
		Webhooks:      &WebhooksController{webhooks: svc.Webhooks},
		Tasks:         &TasksController{tasks: svc.Tasks},
		Campaigns:     &CampaignsController{campaigns: svc.Campaigns},
		Outbox:        &OutboxController{outbox: svc.Outbox},
		Memory:        &MemoryController{memory: svc.Memory},
	}
}

type HealthController struct{}

func (c *HealthController) Health(w http.ResponseWriter, _ *http.Request) {
	respond.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "backend-core"})
}

type OrganizationsController struct {
	organizations *services.OrganizationService
}

func (c *OrganizationsController) Create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name string `json:"name"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	org, err := c.organizations.Create(r.Context(), input.Name)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, org)
}

func (c *OrganizationsController) Get(w http.ResponseWriter, r *http.Request) {
	org, err := c.organizations.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if org == nil {
		respond.WriteError(w, http.StatusNotFound, "organization not found")
		return
	}
	respond.WriteJSON(w, http.StatusOK, org)
}

type LeadsController struct {
	leads *services.LeadService
}

func (c *LeadsController) Create(w http.ResponseWriter, r *http.Request) {
	var input services.CreateLeadInput
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	lead, err := c.leads.Create(r.Context(), input)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, lead)
}

func (c *LeadsController) Get(w http.ResponseWriter, r *http.Request) {
	lead, err := c.leads.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if lead == nil {
		respond.WriteError(w, http.StatusNotFound, "lead not found")
		return
	}
	respond.WriteJSON(w, http.StatusOK, lead)
}

type EventsController struct {
	events *services.EventService
}

func (c *EventsController) Create(w http.ResponseWriter, r *http.Request) {
	var input services.CreateEventInput
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	event, err := c.events.Create(r.Context(), input)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, event)
}

type ConversationsController struct {
	conversations *services.ConversationService
}

func (c *ConversationsController) IngestMessage(w http.ResponseWriter, r *http.Request) {
	var input services.IngestMessageInput
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	state, err := c.conversations.IngestMessage(r.Context(), input)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusAccepted, state)
}

func (c *ConversationsController) Restart(w http.ResponseWriter, r *http.Request) {
	var input struct {
		OrganizationID string `json:"organization_id"`
		RemoteJID      string `json:"remote_jid"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if err := c.conversations.Restart(r.Context(), input.OrganizationID, input.RemoteJID); err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type MemoryController struct {
	memory *services.MemoryService
}

func (c *MemoryController) Ensure(w http.ResponseWriter, r *http.Request) {
	var input struct {
		OrganizationID string          `json:"organization_id"`
		RemoteJID      string          `json:"remote_jid"`
		RegistryID     string          `json:"registry_id"`
		DisplayName    string          `json:"display_name"`
		Payload        json.RawMessage `json:"payload"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	state, err := c.memory.EnsureCustomerContext(r.Context(), services.EnsureCustomerContextInput{
		OrganizationID: input.OrganizationID,
		RemoteJID:      input.RemoteJID,
		RegistryID:     input.RegistryID,
		DisplayName:    input.DisplayName,
		Payload:        input.Payload,
	})
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusOK, state)
}

type WebhooksController struct {
	webhooks *services.WebhookService
}

func (c *WebhooksController) Lumi(w http.ResponseWriter, r *http.Request) {
	if !c.webhooks.AuthorizeLumi(
		r.Header.Get("X-Lumi-Webhook-Secret"),
		r.Header.Get("X-Webhook-Secret"),
		r.Header.Get("Authorization"),
		r.URL.Query().Get("secret"),
	) {
		respond.WriteError(w, http.StatusUnauthorized, "unauthorized_webhook")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_body")
		return
	}
	result, err := c.webhooks.HandleLumi(r.Context(), r.PathValue("organization_id"), json.RawMessage(body))
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusAccepted, result)
}

type TasksController struct {
	tasks *services.TaskService
}

func (c *TasksController) Create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		OrganizationID string          `json:"organization_id"`
		Title          string          `json:"title"`
		Payload        json.RawMessage `json:"payload"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	task, err := c.tasks.Create(r.Context(), input.OrganizationID, input.Title, input.Payload)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, task)
}

type CampaignsController struct {
	campaigns *services.CampaignService
}

func (c *CampaignsController) Create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		OrganizationID string          `json:"organization_id"`
		Name           string          `json:"name"`
		Payload        json.RawMessage `json:"payload"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	campaign, err := c.campaigns.Create(r.Context(), input.OrganizationID, input.Name, input.Payload)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, campaign)
}

type OutboxController struct {
	outbox *services.OutboxService
}

func (c *OutboxController) Create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		OrganizationID string          `json:"organization_id"`
		Channel        string          `json:"channel"`
		Recipient      string          `json:"recipient"`
		Payload        json.RawMessage `json:"payload"`
	}
	if err := respond.DecodeJSON(r, &input); err != nil {
		respond.WriteError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	message, err := c.outbox.Create(r.Context(), input.OrganizationID, input.Channel, input.Recipient, input.Payload)
	if err != nil {
		respond.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	respond.WriteJSON(w, http.StatusCreated, message)
}
