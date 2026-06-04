# Vimob Chatbot Backend

Servico Go separado do app Lovable/Vite atual. A ideia desta etapa e receber eventos de atendimento, persistir a conversa no Postgres, manter estado rapido em BuntDB e processar trabalhos em goroutines sem mexer no funcionamento atual do Vimob.

## Decisoes da etapa 1

- Go fica como API/ingestao/orquestrador.
- Postgres e a fonte de verdade.
- BuntDB e cache local/estado efemero, nao substitui Postgres nem fila distribuida.
- O worker pool usa goroutines com fila em memoria para a primeira versao.
- O worker Node com OpenAI Agents JS entra na etapa 2, separado.
- Sem sandbox de agentes nesta etapa.

## 10 comandos iniciais

1. `start_conversation`
2. `stop_conversation`
3. `handoff_human`
4. `assign_owner`
5. `tag_lead`
6. `schedule_visit`
7. `property_search`
8. `quote_property`
9. `follow_up`
10. `summarize_conversation`

## Variaveis

```env
VIMOB_BACKEND_ADDR=:8088
DATABASE_URL=postgres://postgres:postgres@localhost:5432/vimob?sslmode=disable
BUNTDB_PATH=./data/chatbot-cache.db
WORKER_COUNT=4
VIMOB_WEBHOOK_SECRET=troque-este-segredo
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4.1-nano
```

Para ligar o espelho a partir da Edge Function `evolution-go-webhook`, configure tambem no Supabase:

```env
VIMOB_BACKEND_URL=https://api.seu-dominio.com
VIMOB_BACKEND_WEBHOOK_SECRET=troque-este-segredo
```

Se `VIMOB_BACKEND_URL` nao estiver configurada, o webhook da Evolution Go segue funcionando exatamente como antes e nao tenta chamar o Go.

## Comandos locais

```sh
cd backend-go
go mod tidy
go run ./cmd/api
```

## Docker

```sh
cd backend-go
docker build -t vimob-chatbot-backend:latest .
docker run --rm -p 8088:8088 \
  -e DATABASE_URL="postgres://..." \
  -e BUNTDB_PATH="/app/data/chatbot-cache.db" \
  -e VIMOB_WEBHOOK_SECRET="troque-este-segredo" \
  vimob-chatbot-backend:latest
```

No Portainer/Traefik, exponha a porta interna `8088` e publique uma URL como `https://api.seu-dominio.com`. Essa URL e a que entra em `VIMOB_BACKEND_URL` na Supabase.

## Rotas

- `GET /healthz`
- `GET /v1/commands`
- `POST /v1/webhooks/whatsapp`
- `GET /v1/conversations/{conversation_id}/state`
- `GET /v1/ai/health`
- `POST /v1/ai/preview`

## Jenny AI control plane

O backend agora tem o contrato inicial da Jenny:

- `GET /v1/ai/health` mostra se a chave OpenAI esta configurada.
- `POST /v1/ai/preview` testa a Jenny em uma organizacao sem depender do WhatsApp.
- Se `OPENAI_API_KEY` nao estiver configurada ou `use_openai=false`, o preview roda em modo sem custo.
- O modelo padrao e economico (`gpt-4.1-nano`) e pode ser alterado em `OPENAI_DEFAULT_MODEL` ou no painel Super Admin.

Exemplo de preview:

```sh
curl -X POST http://localhost:8088/v1/ai/preview \
  -H "Content-Type: application/json" \
  -H "X-Vimob-Webhook-Secret: troque-este-segredo" \
  -d '{"organization_id":"...","message":"Ola, procuro apartamento de 2 quartos","use_openai":false}'
```

## Modo espelho seguro

A primeira integracao com o app atual e apenas espelho: quando uma mensagem recebida chega na `evolution-go-webhook`, a Edge Function continua gravando no Supabase normalmente e dispara uma copia assincrona para `POST /v1/webhooks/whatsapp`.

- Nao muda envio nem recebimento atual.
- Nao bloqueia a conversa se o backend Go estiver fora do ar.
- Usa timeout curto na Edge Function.
- Deduplica no Postgres por `organization_id`, `channel` e `external_id`.

## Etapa 2: Agents JS

O worker Node TypeScript deve consumir uma fila persistente e chamar `@openai/agents`. Para manter conversa com Responses API, grave `last_response_id` no Postgres e envie como `previousResponseId` no proximo turno. Para conversas compartilhadas por varios servicos, prefira `conversationId`.
