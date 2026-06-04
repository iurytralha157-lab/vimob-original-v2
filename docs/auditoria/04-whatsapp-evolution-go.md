# Auditoria Vimob - 04 WhatsApp e Evolution Go

Escopo: leitura local de hooks, Edge Functions e componentes relacionados a WhatsApp/Evolution Go. Nenhuma chamada externa foi feita.

## Arquivos principais lidos

- `EVOLUTION_GO_CHECKPOINT.md`
- `migrations/evolution_go_phase1.sql`
- `migrations/evolution_go_phase10.sql`
- `supabase/functions/evolution-go-proxy/index.ts`
- `supabase/functions/evolution-go-webhook/index.ts`
- `supabase/functions/message-sender/index.ts`
- `supabase/functions/media-worker/index.ts`
- `src/hooks/use-evolution-go.ts`
- `src/hooks/use-whatsapp-sessions.ts`
- `src/hooks/use-whatsapp-conversations.ts`
- `src/components/settings/WhatsAppTab.tsx`
- `src/lib/whatsapp-provider.ts`

## Situacao atual percebida

Evolution Go ja existe no sistema e agora foi definido como provider unico para novas conexoes no frontend principal.

O que ja existe:

- Provider `evolution_go` em `whatsapp_sessions`.
- `evolution-go-proxy` com acoes de instancia, status, QR, envio, grupos, labels e user info.
- `evolution-go-webhook` para eventos de QR, conexao, mensagens, labels e grupos.
- Normalizacao correta do ponto critico `LoggedIn` versus `Connected`.
- Hooks `use-evolution-go`, `use-whatsapp-labels`, `use-whatsapp-groups`, `use-whatsapp-contacts`.
- UI em `WhatsAppTab` preparada para mostrar recursos Evolution Go.

O que ainda nao esta fechado:

- Validacao real em staging ainda nao foi feita.
- Ainda existem Edge Functions legadas com `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` fora do fluxo principal. Elas entram no Bloco 3.

Atualizacao local em 2026-05-29:

- `useSendWhatsAppMessage` passou a carregar `provider` da sessao e usar `getWhatsAppClient`.
- `src/lib/whatsapp-provider.ts` agora normaliza envio de texto/midia para Evolution API antiga e Evolution Go.
- `message-sender` passou a decidir por mensagem: `evolution` usa API legada; `evolution_go` chama `evolution-go-proxy`.
- `automation-executor` passou a usar helper provider-aware para texto, imagem, video e audio de automacoes.
- Nao houve chamada remota no Supabase.
- Build/teste local ficou pendente porque `npm` e `deno` nao estao disponiveis, `node_modules` nao existe e o `node.exe` encontrado retornou acesso negado.

Atualizacao local em 2026-05-30:

- `EVOLUTION_GO_CREATION_ENABLED` foi ligado.
- `WHATSAPP_LEGACY_EVOLUTION_ENABLED` foi criado como `false`.
- Criacao de novas conexoes no `WhatsAppTab` agora envia sempre `provider: "evolution_go"`.
- O seletor de provider foi removido da tela principal; a UI informa que novas conexoes usam apenas Evo Go.
- QR/status/recreate/logout no hook principal bloqueiam Evolution legada e usam Evolution Go.
- `getWhatsAppClient` nao chama mais `evolution-proxy`; sessoes legadas retornam erro orientando recriar em Evo Go.
- Health monitor do frontend nao chama mais `evolution-proxy`.
- Envio de midia no chat passa a mandar base64 para Evo Go, mantendo URL/storage apenas para exibicao local.
- `evolution-go-webhook` foi ampliado para aceitar payloads com lista de mensagens, variantes de evento `message.received`, updates de status/recibo e tentativa de buscar avatar.
- Marcacao manual como lida foi religada usando `message.markread` da Evo Go.

Pendente de deploy:

- `supabase/functions/evolution-go-webhook/index.ts` precisa ser publicado para recebimento, avatar e recibos funcionarem no teste real.
- `supabase/functions/evolution-go-proxy/index.ts` nao foi alterada nesta etapa, mas continua sendo dependencia do envio/status.

## Achado A - Evolution Go creation estava desativado

Local:

- `src/hooks/use-whatsapp-sessions.ts`

Sinal original:

- `EVOLUTION_GO_CREATION_ENABLED = false`

Leitura:

- A UI pode estar preparada, mas novas conexoes ainda tendem a cair na Evolution API normal.
- Isso e bom para seguranca durante auditoria, mas precisa virar uma decisao explicita.

Atualizacao:

- `EVOLUTION_GO_CREATION_ENABLED = true`.
- Novas conexoes sao Evo Go-only.

Pendente:

- Criar uma nova conexao local e confirmar que aparece no painel da Evolution Go.

## Achado B - Envio principal nao usava Evolution Go

Local:

- `src/hooks/use-whatsapp-conversations.ts`, `useSendWhatsAppMessage`.

Sinal original:

- O envio chama `supabase.functions.invoke("evolution-proxy")`.
- A funcao nao escolhe provider da sessao.

Risco:

- Uma sessao `evolution_go` pode receber status/QR via Go, mas envio pelo chat principal ainda tentar usar Evolution API antiga.
- Isso pode quebrar envio de texto/imagem/audio quando a sessao for Go.

Classificacao:

- Prioridade alta para consolidacao Evolution Go.

Atualizacao:

- Ajuste local aplicado para enviar via `getWhatsAppClient(session)`.
- Sessoes sem provider agora tentam `evolution_go`.
- Sessoes `evolution_go` passam pelo `evolution-go-proxy`.

Pendente:

- Testar texto, imagem, audio, documento e grupo.

## Achado C - Provider router existe e agora e usado no envio principal

Local:

- `src/lib/whatsapp-provider.ts`

Sinal original:

- `getWhatsAppClient` roteia `sendText`, `sendMedia`, `sendAudio` por provider.
- Busca por uso indica que ele nao esta integrado ao envio principal.

Atualizacao:

- `src/hooks/use-whatsapp-conversations.ts` passou a importar e usar `getWhatsAppClient`.
- O roteador tambem foi ajustado para usar as actions legadas reais: `sendMessage` e `sendFile`.

## Achado D - Inbound Go trata midia direto no webhook

Local:

- `supabase/functions/evolution-go-webhook/index.ts`

Sinal:

- Se vier `base64`, a function faz decode, sobe no bucket `whatsapp-media` e atualiza `whatsapp_messages`.

Risco:

- Para midias grandes, o webhook pode ficar pesado.
- Para "velocidade absurda", o ideal e webhook salvar evento rapido e delegar midia pesada para worker/fila.

Recomendacao:

- Curto prazo: validar se a Evolution Go entrega base64 pequeno/medio bem.
- Medio prazo: webhook apenas cria job em fila; worker baixa/comprime/sobe midia.

## Achado E - Outbox atual usava Evolution API antiga

Local:

- `supabase/functions/message-sender/index.ts`

Sinal original:

- Usa `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
- Monta endpoints `/message/sendMedia/{instance_name}` e `/message/sendText/{instance_name}`.
- Nao le `session.provider`.

Risco:

- Automacoes/outbox podem falhar ou enviar pelo provider errado para sessoes Evolution Go.

Atualizacao:

- Ajuste local aplicado para buscar `session.provider`.
- Provider `evolution` segue usando os endpoints legados.
- Provider `evolution_go` chama `evolution-go-proxy` com `send.text`, `send.media` ou `send.audio`.
- A function nao falha mais globalmente se a credencial da Evolution antiga estiver ausente; ela falha apenas quando uma mensagem legacy precisar dela.

Pendente:

- Validar em staging se `evolution-go-proxy` aceita chamada interna com service role.
- Testar outbox de texto, imagem e audio com sessao Evolution Go real.

## Achado F - Status Go foi pensado com cuidado

Local:

- `EVOLUTION_GO_CHECKPOINT.md`
- `supabase/functions/evolution-go-proxy/index.ts`
- `supabase/functions/evolution-go-webhook/index.ts`

Leitura:

- A regra `LoggedIn: true` como verdade para `connected` esta correta para evitar falso positivo.
- `Connected: true` sem `LoggedIn` vira `qr_ready`.

Recomendacao:

- Preservar essa regra.
- Escrever teste manual/checklist antes de alterar.

## Achado G - Automacoes diretas tambem precisavam provider-aware

Local:

- `supabase/functions/automation-executor/index.ts`

Sinal original:

- Acoes `send_whatsapp`, `send_image`, `send_audio` e `send_video` usavam `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
- Uma automacao configurada com sessao Evolution Go poderia tentar enviar pelo endpoint antigo.

Atualizacao:

- Ajuste local aplicado para rotear por `session.provider`.
- Provider `evolution` continua usando Evolution API antiga.
- Provider `evolution_go` chama `evolution-go-proxy`.

Pendente:

- Validar texto, imagem, video e audio em staging.
- Confirmar se audio URL do builder precisa de `mimetype` real em vez de fallback `audio/ogg`.

## Matriz minima de testes Evolution Go

1. Criar instancia Go em staging.
2. Gerar QR.
3. Confirmar que QR nao marca `connected`.
4. Escanear QR.
5. Confirmar `LoggedIn: true` e status `connected`.
6. Receber texto.
7. Enviar texto pelo chat principal.
8. Receber imagem.
9. Enviar imagem.
10. Receber audio.
11. Enviar audio.
12. Enviar documento.
13. Receber mensagem de grupo.
14. Testar labels.
15. Testar groups.
16. Desconectar pelo celular e confirmar status.
17. Reconectar sem recriar sessao.
18. Validar historico e dedupe.

## Decisao recomendada

Antes de mexer no banco:

- Consolidar o roteamento provider-aware no frontend/Edge Function.
- Manter Evolution API antiga funcionando.
- Testar Evolution Go em paralelo.
- Depois mover envio/outbox/midia para backend Go ou worker, se fizer sentido.
