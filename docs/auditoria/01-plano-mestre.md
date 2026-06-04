# Auditoria Vimob - 01 Plano Mestre

Objetivo: tirar o Vimob de uma base Lovable/Supabase muito funcional, mas espalhada, e levar para uma arquitetura organizada, escalavel e preparada para rodar fora do Lovable sem quebrar usuarios atuais.

## Regra de trabalho

Toda etapa segue o ciclo:

1. Avaliar.
2. Mapear risco.
3. Planejar a mudanca.
4. Executar em ambiente isolado.
5. Testar.
6. Mostrar evidencias.
7. Aprovar proximo passo.

## Fase 0 - Auditoria local

Status: em andamento.

Objetivo:

- Inventariar paginas, rotas, hooks, componentes, Edge Functions, migrations e pontos Supabase.
- Separar fluxo critico de codigo secundario.
- Criar plano de execucao por checkpoints.

Saida esperada:

- Inventario local.
- Mapa de risco.
- Ordem de ataque.

## Fase 1 - Documentacao real do sistema

Objetivo:

- Criar documentacao tecnica do Vimob.
- Registrar modulos, variaveis, deploy, banco, Edge Functions, Evolution Go e fluxo de suporte.

Arquivos-alvo:

- `docs/arquitetura.md`
- `docs/banco.md`
- `docs/evolution-go.md`
- `docs/deploy-portainer-traefik.md`
- `docs/runbook-producao.md`

Checkpoint:

- Um dev novo consegue entender como o sistema funciona sem abrir todos os arquivos.

## Fase 2 - Auth, organizacoes e permissoes

Objetivo:

- Validar multi-tenant.
- Revisar `AuthContext`, guards, roles, organization switching e funcoes de permissao.
- Mapear RLS relacionada a usuarios, organizacoes, membros e roles.

Por que vem cedo:

- Se auth/organizacao estiver inconsistente, todo o resto escala com risco.

Checkpoint:

- Login, troca de organizacao, super admin, admin e usuario comum funcionando sem redirecionamento errado.

## Fase 3 - WhatsApp e Evolution Go

Objetivo:

- Consolidar Evolution Go como provider principal.
- Manter Evolution API atual como fallback ate validar.
- Revisar envio/recebimento de texto, imagem, audio, documento, grupos, labels, status e QR.
- Confirmar compressao/tratamento de midia.

Arquivos principais:

- `supabase/functions/evolution-go-proxy/index.ts`
- `supabase/functions/evolution-go-webhook/index.ts`
- `src/hooks/use-evolution-go.ts`
- `src/hooks/use-whatsapp-sessions.ts`
- `src/hooks/use-whatsapp-conversations.ts`
- `src/lib/whatsapp-provider.ts`
- `supabase/functions/media-worker/index.ts`
- `supabase/functions/message-sender/index.ts`

Checkpoint:

- Criar sessao Evolution Go, conectar QR, receber mensagem, enviar texto, enviar imagem, receber imagem, enviar audio e confirmar status.

## Fase 4 - Backend Go

Objetivo:

- Decidir o papel exato do backend Go.
- Migrar apenas fluxos que se beneficiam de controle centralizado, fila, cache e processamento pesado.

Responsabilidades candidatas:

- Webhooks WhatsApp/Evolution Go.
- Outbox de mensagens.
- Compressao e processamento de midia.
- Rate limit e retry.
- Auditoria operacional.
- Ponte futura para agentes em Node TypeScript.

Nao migrar agora:

- CRUD simples protegido por RLS que ja funciona bem no Supabase.

Checkpoint:

- Backend sobe em paralelo sem alterar o app atual e processa um fluxo pequeno ponta a ponta.

## Fase 5 - Banco e RLS

Objetivo:

- Auditar schema real, RLS, policies, views, functions, triggers e indices.
- Comparar migrations locais com banco ativo antes de qualquer alteracao.

Regra:

- Banco e a ultima coisa a alterar, porque afeta usuarios atuais.

Checkpoint:

- Lista de ajustes com impacto, rollback e horario seguro de aplicacao.

## Fase 6 - Staging no servidor

Objetivo:

- Subir frontend, backend Go, workers, Evolution Go e servicos auxiliares no servidor via Portainer e Traefik.
- Usar o mesmo banco apenas quando o ambiente estiver controlado e sem escrita perigosa.

Servicos candidatos:

- Frontend Vite buildado.
- Backend Go.
- Worker Node TypeScript para agentes.
- Evolution Go.
- Redis ou Valkey no futuro, se BuntDB/local cache nao for suficiente.
- Observabilidade/logs.

Checkpoint:

- Ambiente staging acessivel, com HTTPS, logs, healthchecks e rotas validadas.

## Fase 7 - Corte gradual fora do Lovable

Objetivo:

- Migrar uso real aos poucos.
- Validar modulos por grupo de usuarios.
- Manter plano de rollback.

Checkpoint final:

- Sistema funcional fora do Lovable, com frontend, backend, banco, WhatsApp, midia, automacoes e monitoramento estaveis.

