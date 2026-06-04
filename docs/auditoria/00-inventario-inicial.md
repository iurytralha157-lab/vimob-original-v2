# Auditoria Vimob - 00 Inventario Inicial

Data: 2026-05-29

Escopo desta etapa: analise local do repositorio. Nenhuma consulta, alteracao ou comando foi executado no Supabase remoto.

## Resumo numerico

- Paginas React em `src/pages`: 81 arquivos `.tsx`.
- Rotas declaradas em `src/App.tsx`: 78 ocorrencias de `<Route`.
- Edge Functions em `supabase/functions`: 77 diretorios.
- Hooks em `src/hooks`: 142 arquivos.
- Componentes em `src/components`: 298 arquivos `.ts/.tsx`.
- Migrations SQL locais: 364 arquivos `.sql`.
- Tabelas tipadas em `src/integrations/supabase/types.ts`: 143.
- RPC/functions de banco tipadas: 72.
- Chamadas diretas ao Supabase no front: aproximadamente 892.
- Chamadas `supabase.functions.invoke` no front: 61.
- Chamadas `supabase.rpc` no front: 30.

## Paginas por area

- root: 40
- admin: 16
- public: 10
- gamification: 6
- engineering: 4
- operational: 2
- architecture: 1
- purchase: 1
- financial: 1

## Areas funcionais identificadas

- Auth, organizacoes, permissoes e super admin.
- CRM, leads, contatos, pipelines, distribuicao e equipes.
- WhatsApp, Evolution API, Evolution Go, mensagens, midia, sessoes e acesso.
- Automacoes, cadencias, executor, runner, delay processor e templates.
- Financeiro, contratos, comissoes, DRE e Asaas.
- Imoveis, site publico, importacoes Vista/Imoview/WordPress.
- Obras, engenharia, arquitetura, compras e operacional.
- Gamificacao, notificacoes, push, agenda e ajuda.

## Achados iniciais

1. O sistema ja tem backend distribuido em Supabase, Edge Functions, SQL, triggers, RLS e Storage.
2. O projeto ainda depende muito de chamadas diretas do frontend para o Supabase.
3. Evolution Go ja existe no codigo: `evolution-go-proxy`, `evolution-go-webhook`, `use-evolution-go`, `whatsapp-provider` e migrations dedicadas.
4. Existem muitas Edge Functions com `verify_jwt = false`; isso nao e automaticamente errado para webhooks/crons, mas precisa de auditoria individual.
5. TypeScript esta permissivo (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`).
6. Ha muitos logs e muitos usos de `any`, indicando risco de bugs silenciosos.
7. Ha 364 migrations locais, incluindo varios arquivos de fix/hotfix. Antes de mexer no banco, precisamos mapear quais realmente estao aplicadas no ambiente ativo.

## Nao fazer agora

- Nao alterar RLS em producao.
- Nao rodar migration.
- Nao remover codigo sem provar que esta morto.
- Nao migrar todo o frontend para backend de uma vez.
- Nao desligar Evolution API atual antes de Evolution Go estar validado em paralelo.

