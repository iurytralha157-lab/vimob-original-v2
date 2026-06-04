# Auditoria Vimob - 05 Checklist de Execucao

Este checklist e o quadro de trabalho do projeto. Cada bloco so avanca depois de evidencia e aprovacao.

## Bloco 1 - Auth, organizacoes e permissoes

Status: auditado localmente, pendente de validacao real.

Tarefas:

- Validar se `users.organization_id` deve ser organizacao ativa ou apenas padrao.
- Testar usuario multi-org em duas abas.
- Testar admin em uma org e user em outra.
- Corrigir query keys de permissoes para incluir organizacao, se confirmado.
- Revisar `useAssignUserRole` para nao remover roles de outras orgs.

Evidencia esperada:

- Print ou relato de login/troca org.
- Lista de comportamento esperado versus comportamento atual.
- Build passando.

## Bloco 2 - Evolution Go

Status: Evo Go-only aplicado no frontend principal, pendente build e teste real.

Tarefas:

- Confirmar ambiente Evolution Go disponivel.
- Habilitar criacao Go somente em staging/piloto. Alterado para Evo Go-only em 2026-05-30 a pedido do usuario.
- Desativar Evolution legada para novas conexoes. Feito no `WhatsAppTab` e hooks principais.
- Tornar envio principal provider-aware. Feito localmente em 2026-05-29; pendente validacao em ambiente com Node/NPM.
- Tornar outbox/message-sender provider-aware ou mover para backend Go. Feito localmente em `message-sender`; pendente teste em staging.
- Tornar automacoes WhatsApp provider-aware. Feito localmente em `automation-executor`; pendente teste em staging.
- Corrigir envio de midia/audio/documento no chat Evo Go. Feito localmente: envio usa base64 para Evo Go.
- Corrigir recebimento/avatares/recibos no webhook Evo Go. Feito localmente; pendente deploy da Edge Function.
- Religiar marcacao manual como lida via Evo Go. Feito localmente com `message.markread`.
- Testar texto, imagem, audio, documento, grupos, labels e desconexao.
- Auditar Edge Functions legadas restantes com `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` no Bloco 3.

Evidencia esperada:

- QR gerado.
- Status so vira connected com `LoggedIn: true`.
- Mensagem recebida aparece no chat.
- Mensagem enviada sai pelo provider correto.
- Midia enviada/recebida aparece com storage path e status correto.
- Avatar do contato aparece em `contact_picture`.
- Status de mensagem atualiza para delivered/read quando a Evo Go enviar recibos.
- Build local passando. Pendente: `npm` e `deno` nao estao disponiveis, `node_modules` nao existe e `node.exe` retornou acesso negado neste ambiente.

## Bloco 3 - Edge Functions sensiveis

Status: pendente.

Tarefas:

- Classificar as 77 Edge Functions.
- Separar publicas, webhooks, crons, admin, service-only e legado.
- Validar todas as funcoes com `verify_jwt = false`.
- Verificar se funcoes admin exigem secret/role internamente.

Evidencia esperada:

- Tabela por function: finalidade, exposicao, risco, manter/migrar/remover.

## Bloco 4 - Frontend e codigo morto

Status: pendente.

Tarefas:

- Mapear paginas sem rota.
- Mapear componentes nao importados.
- Mapear hooks duplicados ou nao usados.
- Remover somente com build/teste.

Evidencia esperada:

- Lista de candidatos a remocao.
- Remocao em lote pequeno.
- Build passando apos cada lote.

## Bloco 5 - Banco/RLS

Status: pendente e bloqueado ate validarmos ambiente.

Tarefas:

- Comparar migrations locais com banco ativo.
- Listar tabelas sem RLS.
- Listar policies por tabela.
- Listar functions `security definer`.
- Listar indices faltantes em tabelas quentes.

Regra:

- Nao alterar banco antes de termos diagnostico, rollback e janela segura.

Evidencia esperada:

- Relatorio SQL somente leitura.
- Plano de migration separado por risco.

## Bloco 6 - Backend Go

Status: rascunho inicial criado, papel final pendente.

Tarefas:

- Decidir se o Go assume WhatsApp webhook, outbox e media.
- Instalar Go no ambiente local/staging.
- Compilar backend.
- Criar Dockerfile.
- Subir no Portainer/Traefik.
- Testar healthcheck e fluxo pequeno.

Evidencia esperada:

- `GET /healthz` respondendo.
- Logs estruturados.
- Sem impacto no Lovable atual.

## Bloco 7 - Staging e corte gradual

Status: pendente.

Tarefas:

- Definir stack Docker.
- Definir variaveis e secrets.
- Definir dominios e Traefik.
- Rodar frontend fora do Lovable.
- Rodar backend e workers.
- Testar com usuarios piloto.

Evidencia esperada:

- URL staging.
- Prints dos fluxos principais.
- Plano de rollback.
