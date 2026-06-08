# Auditoria de limpeza do projeto

Data da analise: 07/06/2026

## Objetivo

Identificar arquivos, componentes, assets e estruturas que parecem nao estar em uso no Vimob atual, sem remover nada nesta etapa. Este documento serve como base para uma limpeza progressiva, com baixo risco de quebrar producao.

## Metodo usado

- Conferencia do estado do Git.
- Listagem completa de arquivos do repositorio.
- Leitura das rotas principais em `src/App.tsx` e `src/PublicAppRoot.tsx`.
- Cruzamento simples de importacoes a partir de `src/main.tsx`, incluindo imports dinamicos.
- Busca textual por referencias de logos, assets, paginas e hooks.
- Conferencia do Docker principal e do backend Go.

Resultado do grafo inicial de importacoes:

- Total de arquivos analisados em `src`: 577
- Arquivos alcancaveis a partir de `src/main.tsx`: 477
- Arquivos nao alcancaveis diretamente: 100

Importante: "nao alcancavel" nao significa automaticamente "pode apagar". Pode haver uso dinamico, uso futuro, arquivo mantido por produto, ou referencia indireta via banco/configuracao.

## Achados principais

### 1. Assets duplicados ou aparentemente obsoletos

Arquivos versionados em `src/assets` sem import direto encontrado:

- `src/assets/logo.png`
- `src/assets/logo-white.png`
- `src/assets/logo-black.png`
- `src/assets/login-bg.jpg`

Hoje o app usa principalmente assets publicos:

- `/favicon.webp`
- `/logo-white.png`
- `/icons/apple-touch-icon.png`
- `/icons/icon-*.png`
- `/placeholder.svg`

Referencias confirmadas:

- `src/App.tsx` usa `/favicon.webp`.
- `src/components/layout/AppSidebar.tsx` usa `/favicon.webp`.
- `src/components/admin/AdminSidebar.tsx` usa `/favicon.webp`.
- `src/hooks/use-system-branding.ts` usa `/favicon.webp`.
- `src/pages/public/PublicSiteLayout.tsx` usa `/logo-white.png`.
- `index.html`, `manifest.json` e `public/sw.js` usam favicons/icones publicos.

Recomendacao:

- Baixo risco: remover ou arquivar os assets antigos de `src/assets`, apos um build de validacao.
- Manter: assets em `public`, porque sao usados por browser, PWA, favicon, OG image e site publico.

### 2. Paginas sem rota aparente

Paginas que apareceram como nao alcancaveis diretamente:

- `src/pages/OperationalDashboard.tsx`
- `src/pages/TelephonyReports.tsx`
- `src/pages/WhatsAppSettings.tsx`
- `src/pages/admin/AdminSettings.tsx`

Observacao importante:

- A rota `/admin/settings` importa `src/pages/admin/SystemSettings.tsx`, nao `src/pages/admin/AdminSettings.tsx`.

Recomendacao:

- Verificar se essas paginas ainda representam alguma funcionalidade planejada.
- Se nao houver plano ativo, mover para uma pasta de arquivo morto ou remover em uma fase controlada.

### 3. Componentes possivelmente substituidos

Componentes nao alcancaveis que parecem versoes antigas ou substituidas:

- `src/components/contacts/MobileFilters.tsx`
- `src/components/filters/AdvancedFiltersPopover.tsx`
- `src/components/dashboard/SalesFunnel.tsx`
- `src/components/dashboard/RecentActivities.tsx`
- `src/components/dashboard/TopBrokersWidget.tsx`
- `src/components/dashboard/UpcomingTasksWidget.tsx`
- `src/components/dashboard/CampaignPerformanceWidget.tsx`
- `src/components/integrations/MetaFormManager.tsx`
- `src/components/round-robin/PipelineRoundRobinManager.tsx`
- `src/components/round-robin/EditQueueDialog.tsx`
- `src/components/round-robin/RuleEditor.tsx`
- `src/components/round-robin/RulesManager.tsx`
- `src/components/teams/TeamCard.tsx`
- `src/components/teams/TeamLeadersStats.tsx`
- `src/components/telephony/LeadCallsSection.tsx`
- `src/components/telephony/RecordingPlayer.tsx`

Recomendacao:

- Medio risco: revisar por area antes de remover.
- Prioridade de analise:
  1. Filtros antigos, porque ja existe `SharedFilters`.
  2. Dashboard antigo, porque a dashboard atual parece usar outros componentes.
  3. Round-robin/equipes, porque mexe em distribuicao de leads e tem impacto operacional.
  4. Telefonia, porque pode ser modulo futuro.

### 4. Hooks duplicados ou antigos

Duplicacao suspeita:

- `src/hooks/use-push-notifications.ts`
- `src/hooks/usePushNotifications.ts`

O layout atual importa:

- `src/hooks/use-push-notifications.ts`

O arquivo `usePushNotifications.ts` parece legado.

Outros hooks nao alcancaveis diretamente:

- `src/hooks/use-admin-dashboard.ts`
- `src/hooks/use-auto-create-contract.ts`
- `src/hooks/use-create-round-robin.ts`
- `src/hooks/use-feature-flags.ts`
- `src/hooks/use-invitation-by-token.ts`
- `src/hooks/use-invitations.ts`
- `src/hooks/use-lead-full-history.ts`
- `src/hooks/use-leader-stats.ts`
- `src/hooks/use-local-storage.ts`
- `src/hooks/use-message-templates.ts`
- `src/hooks/use-meta-insights.ts`
- `src/hooks/use-pipeline-round-robin.ts`
- `src/hooks/use-round-robin-rules.ts`
- `src/hooks/use-smart-installments.ts`
- `src/hooks/use-stage-operational-configs.ts`
- `src/hooks/use-team-ranking.ts`
- `src/hooks/use-telecom-dashboard-stats.ts`
- `src/hooks/use-user-organizations.ts`
- `src/hooks/use-vgv.ts`
- `src/hooks/use-whatsapp-contacts.ts`
- `src/hooks/use-whatsapp-groups.ts`
- `src/hooks/use-whatsapp-messages-paginated.ts`

Recomendacao:

- Baixo risco inicial: confirmar/remover `usePushNotifications.ts` se nao houver import.
- Medio risco: hooks ligados a modulos ainda em evolucao devem ser revisados por modulo.

### 5. Componentes UI nao usados diretamente

Componentes Shadcn/UI nao alcancaveis diretamente:

- `src/components/ui/aspect-ratio.tsx`
- `src/components/ui/breadcrumb.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/context-menu.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/input-otp.tsx`
- `src/components/ui/menubar.tsx`
- `src/components/ui/navigation-menu.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/resizable.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/toggle.tsx`
- `src/components/ui/toggle-group.tsx`
- `src/components/ui/use-toast.ts`

Recomendacao:

- Nao remover em massa agora.
- Esses arquivos sao pequenos e podem ser usados rapidamente em novas telas.
- Remover apenas se a equipe decidir manter o design system mais enxuto.

### 6. SQL e migrations acumuladas

Estruturas encontradas:

- `supabase/migrations`: 385 arquivos.
- `migrations`: 28 arquivos.
- Arquivos `.sql` soltos na raiz.

Arquivos SQL soltos na raiz incluem:

- `fix_database_policies.sql`
- `fix_gamification.sql`
- `fix_image_upload_rls.sql`
- `fix_prospecting_report_v2.sql`
- `fix_rls_notifications.sql`
- `migration-completa-2026-01-17.sql`
- `notification_schema_v2.sql`
- `phase1_meta_webhook_events.sql`
- `remove_gamification_triggers.sql`
- `schema-api-publica.sql`
- `schema-consolidado.sql`
- `setup_whatsapp_tables.sql`
- `sql_agenda_comments_assignees.sql`
- `sql_chat_retention.sql`
- `update_gamification_function.sql`
- `update_gamification_triggers_gating.sql`

Recomendacao:

- Nao apagar migrations oficiais do Supabase.
- Separar SQL solto em uma pasta `docs/sql-historico` ou `archive/sql`, se ainda for util como registro.
- Manter somente migrations oficiais em `supabase/migrations` como fonte principal de schema.

### 7. Backend Go separado

O diretorio `backend-go` esta versionado e possui README, Dockerfile e codigo de API.

O Docker principal do app (`Dockerfile`) faz apenas:

- build do app Vite;
- copia `dist`;
- serve via Nginx.

O `backend-go` nao entra no deploy principal do Vimob.

Recomendacao:

- Nao remover agora.
- Tratar como projeto paralelo/futuro para chatbot/Jenny.
- Se ele nao estiver no roadmap atual, mover para branch separada ou documentar claramente como modulo experimental.

### 8. Arquivos temporarios e logs

Encontrados:

- `tmp/plenus_flip_records.json`
- `tmp/vite-current.err.log`
- `tmp/vite-current.log`
- `vite-dev.log`
- `vite-dev.err.log`
- `vite-dev.out.log`

Observacao:

- `tmp` e logs atuais nao apareceram versionados no Git.
- Nao sao problema de repositorio neste momento.

Recomendacao:

- Garantir que `tmp/`, `dist/`, logs e caches locais seguem no `.gitignore`.

## Plano recomendado de limpeza

### Fase 1: Limpeza segura

Objetivo: remover somente candidatos com baixo risco e validar build.

Candidatos:

- `src/assets/logo.png`
- `src/assets/logo-white.png`
- `src/assets/logo-black.png`
- `src/assets/login-bg.jpg`
- `src/App.css`, se confirmado sem import
- `src/hooks/usePushNotifications.ts`, se confirmado sem import

Validacao:

- `npm run build`
- abrir `/auth`, `/dashboard`, `/crm/pipelines`, `/crm/contacts`, `/properties`
- conferir favicon, logo da sidebar, loader e PWA basico

### Fase 2: Remocao de paginas sem rota

Objetivo: remover paginas realmente inacessiveis ou migrar para arquivo morto.

Candidatos:

- `src/pages/OperationalDashboard.tsx`
- `src/pages/TelephonyReports.tsx`
- `src/pages/WhatsAppSettings.tsx`
- `src/pages/admin/AdminSettings.tsx`

Validacao:

- `npm run build`
- busca por rotas/menu que apontem para essas paginas
- conferir menus mobile/desktop

### Fase 3: Consolidacao de componentes antigos

Objetivo: limpar componentes substituidos por versoes novas.

Grupos:

- filtros antigos;
- dashboard antiga;
- round-robin antigo;
- equipes antigas;
- telefonia.

Validacao:

- `npm run build`
- testes manuais por modulo
- se possivel, adicionar testes de smoke com Playwright futuramente

### Fase 4: Organizacao de SQL historico

Objetivo: separar schema/migrations oficiais de arquivos historicos.

Acoes:

- manter `supabase/migrations` como fonte oficial;
- mover SQL solto para arquivo historico;
- avaliar se a pasta `migrations` antiga ainda precisa existir.

Validacao:

- nenhuma migracao oficial removida;
- deploy continua usando Supabase migrations atuais.

## Recomendacao final

Nao fazer uma limpeza agressiva de uma vez. O projeto tem muitas areas sensiveis: CRM, distribuicao de leads, WhatsApp, agenda, site publico, Supabase Edge Functions e PWA.

O melhor caminho e:

1. Remover primeiro assets e duplicatas de baixo risco.
2. Rodar build.
3. Subir commit pequeno.
4. Depois atacar paginas e componentes antigos por modulo.

Assim a gente reduz peso e confusao sem criar regressao escondida.
