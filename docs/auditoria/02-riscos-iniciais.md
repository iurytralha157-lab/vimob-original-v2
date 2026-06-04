# Auditoria Vimob - 02 Riscos Iniciais

## Risco 1 - Supabase exposto demais ao frontend

Sinal:

- Aproximadamente 892 chamadas diretas ao Supabase no frontend.

Leitura:

- Isso nao e necessariamente bug, porque RLS existe para proteger acesso.
- O risco aparece nos fluxos com regra critica, muita escrita, alta frequencia ou processamento pesado.

Acao recomendada:

- Manter CRUD simples no Supabase.
- Mover WhatsApp, midia, filas, agentes e automacoes sensiveis para backend/worker com controle central.

## Risco 2 - Edge Functions sensiveis com `verify_jwt = false`

Sinal:

- Muitas funcoes no `supabase/config.toml` estao com JWT desativado.

Leitura:

- Webhooks publicos precisam mesmo aceitar chamada externa.
- Mas funcoes como criacao/gestao de usuario, organizacao, SQL fix, workers e automacoes precisam de validacao interna forte.

Acao recomendada:

- Auditar funcao por funcao.
- Classificar como: publica, webhook externo, cron interno, admin, service-only.
- Verificar se cada uma valida secret/token/assinatura/role internamente.

## Risco 3 - Evolution Go parcialmente implementado

Sinal:

- Ja existem proxy, webhook, hooks, provider router, migrations e checkpoint tecnico.

Leitura:

- A prioridade nao e implementar do zero.
- A prioridade e consolidar e testar fluxo real.

Acao recomendada:

- Criar matriz de testes Evolution Go.
- Validar status `LoggedIn` versus `Connected`.
- Validar envio/recebimento de midia.
- Validar fallback para Evolution API atual.

## Risco 4 - Migrations e hotfixes acumulados

Sinal:

- 364 arquivos SQL locais.
- Muitos nomes de `fix`, `final_fix`, `test`, `phase`.

Leitura:

- O historico indica produto vivo e muito ajuste rapido.
- O risco e nao saber se o banco ativo esta igual ao repositorio.

Acao recomendada:

- Antes de qualquer alteracao: listar migrations aplicadas no Supabase.
- Comparar schema ativo com tipos gerados e migrations.
- So entao criar migration limpa.

## Risco 5 - TypeScript permissivo

Sinal:

- `strict: false`
- `noImplicitAny: false`
- `strictNullChecks: false`
- Muitos `any`.

Leitura:

- Isso acelera desenvolvimento, mas deixa bugs de dados passarem.

Acao recomendada:

- Nao ligar strict global agora.
- Criar ilhas de tipagem em modulos criticos: WhatsApp, Auth, automacoes, financeiro.

## Risco 6 - Logs demais e possivel vazamento operacional

Sinal:

- Mais de mil ocorrencias de `console.log/warn/error/debug` em `src` e `supabase`.

Leitura:

- Log em Edge Function e util, mas precisa padrao.
- Frontend em producao nao deve ter log sensivel.

Acao recomendada:

- Criar logger central.
- Remover logs de debug do front gradualmente.
- Mas preservar logs estruturados em workers e webhooks.

