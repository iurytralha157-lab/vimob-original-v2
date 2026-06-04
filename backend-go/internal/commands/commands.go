package commands

type Command struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func List() []Command {
	return []Command{
		{Name: "start_conversation", Description: "Inicia atendimento automatico para uma conversa."},
		{Name: "stop_conversation", Description: "Pausa o atendimento automatico."},
		{Name: "handoff_human", Description: "Transfere a conversa para um atendente humano."},
		{Name: "assign_owner", Description: "Define responsavel comercial ou SDR."},
		{Name: "tag_lead", Description: "Aplica marcador no lead/conversa."},
		{Name: "schedule_visit", Description: "Agenda visita ou compromisso."},
		{Name: "property_search", Description: "Busca imoveis compativeis com o interesse."},
		{Name: "quote_property", Description: "Gera proposta/orcamento para um imovel."},
		{Name: "follow_up", Description: "Cria uma proxima acao de acompanhamento."},
		{Name: "summarize_conversation", Description: "Resume historico e intencao do contato."},
	}
}
