# Diagnostico do pico diario no banco - 2026-06-11

## Resumo

O pico diario parece ser a combinacao de crons concentrados no mesmo horario, jobs duplicados/quebrados e consultas de telefone que fazem varredura em `leads`.

Principais evidencias no Supabase:

- `cron.job` tem dois jobs diarios as 06:00 UTC / 03:00 America/Sao_Paulo chamando a mesma funcao:
  - `generate-recurring-entries`
  - `recurring-entries-generator`
- No mesmo horario rodam:
  - `vista-scheduled-sync` as 03:00, 11:00 e 19:00 America/Sao_Paulo
  - `imoview-scheduled-sync` as 03:10, 11:10 e 19:10 America/Sao_Paulo
  - `automation-delay-processor` todo minuto
  - `media-worker-processor` a cada 2 minutos
  - `pool-checker` a cada 2 minutos
- Existem jobs quebrados rodando continuamente:
  - `meta-webhook-replay-job` falha a cada 10 minutos por erro de coluna `value` em `vault.secrets`.
  - `notification-dispatcher-hourly` falha toda hora por `unrecognized configuration parameter "app.supabase_url"`.
  - `whatsapp-retention-daily` falhou por volta de 00:00 America/Sao_Paulo.
- Logs de Postgres nas ultimas 24h mostram erros recorrentes de `canceling statement due to statement timeout`.
- Logs de API mostram consultas grandes em `leads` com varios `phone.ilike.%...%`, inclusive a partir de `sync-whatsapp-contacts` e fluxos de conversas WhatsApp.

## Causa mais provavel

O problema nao parece ser um unico SQL diario; parece ser uma tempestade:

1. As 03:00 America/Sao_Paulo disparam dois jobs duplicados de recorrencia financeira e sincronizacao Vista.
2. Em seguida entram Imoview, workers de midia, pool checker e automacoes.
3. Em paralelo, os webhooks/syncs de WhatsApp consultam `leads` usando `ILIKE '%telefone%'`.
4. `ILIKE '%...%'` nao aproveita o indice btree comum de `phone`, entao a consulta tende a varrer `leads`.
5. Quando ha rajada de webhooks/syncs, essas varreduras viram `statement timeout`, seguram conexoes e derrubam a saude do banco.

O banco ja tem um indice bom para o caminho certo:

```sql
CREATE UNIQUE INDEX leads_org_phone_unique
ON public.leads (organization_id, normalize_phone(phone))
WHERE phone IS NOT NULL
  AND btrim(phone) <> ''
  AND normalize_phone(phone) IS NOT NULL
  AND normalize_phone(phone) <> '';
```

Mas varios pontos do codigo ainda nao usam esse caminho.

## Pontos de codigo com risco

- `supabase/functions/sync-whatsapp-contacts/index.ts`
  - `updateLeadsAvatarByPhone` usa `phone.ilike.%...%`.
- `supabase/functions/evolution-go-webhook/index.ts`
  - `findLeadByPhone` usa `phone.ilike.%...%` e fallback por tail.
  - `updateLeadsAvatarForConversation` usa `phone.ilike.%...%`.
  - `refreshConversationAvatar` usa `phone.ilike.%...%`.
- `supabase/functions/threecplus-webhook/index.ts`
  - busca lead por telefone com `phone.ilike.%...%`.
- `src/hooks/use-whatsapp-conversations.ts`
  - busca leads para conversas sem `lead_id` usando uma lista grande de `phone.ilike.%...%`.

## Mitigacao imediata recomendada

Aplicado em 2026-06-11:

- Removido `generate-recurring-entries`.
- Mantido `recurring-entries-generator` ativo as 06:00 UTC / 03:00 America/Sao_Paulo.
- Pausado `notification-dispatcher-hourly`, que falhou 24/24 vezes nas ultimas 24h.
- Pausado `meta-webhook-replay-job`, que falhou 144/144 vezes nas ultimas 24h.
- Reagendado `vista-scheduled-sync` de `0 6,14,22 * * *` para `20 6,14,22 * * *`.
- Reagendado `imoview-scheduled-sync` de `10 6,14,22 * * *` para `45 6,14,22 * * *`.

O que ficou intacto:

- `automation-delay-processor` continua todo minuto.
- `media-worker-processor` continua a cada 2 minutos.
- `pool-checker` continua a cada 2 minutos.
- `recurring-entries-generator` continua diario.
- `mark-overdue-financial-entries` nao foi alterado.
- `whatsapp-retention-daily` nao foi alterado.

SQL aplicado:

```sql
do $$
declare
  v_vista_command text;
  v_imoview_command text;
begin
  select command into v_vista_command from cron.job where jobname = 'vista-scheduled-sync' limit 1;
  select command into v_imoview_command from cron.job where jobname = 'imoview-scheduled-sync' limit 1;

  if exists (select 1 from cron.job where jobname = 'generate-recurring-entries') then
    perform cron.unschedule('generate-recurring-entries');
  end if;

  if exists (select 1 from cron.job where jobname = 'notification-dispatcher-hourly') then
    perform cron.unschedule('notification-dispatcher-hourly');
  end if;

  if exists (select 1 from cron.job where jobname = 'meta-webhook-replay-job') then
    perform cron.unschedule('meta-webhook-replay-job');
  end if;

  if v_vista_command is not null then
    if exists (select 1 from cron.job where jobname = 'vista-scheduled-sync') then
      perform cron.unschedule('vista-scheduled-sync');
    end if;
    perform cron.schedule('vista-scheduled-sync', '20 6,14,22 * * *', v_vista_command);
  end if;

  if v_imoview_command is not null then
    if exists (select 1 from cron.job where jobname = 'imoview-scheduled-sync') then
      perform cron.unschedule('imoview-scheduled-sync');
    end if;
    perform cron.schedule('imoview-scheduled-sync', '45 6,14,22 * * *', v_imoview_command);
  end if;
end $$;
```

Plano original de distribuicao:

- `recurring-entries-generator`: manter as 03:00.
- `vista-scheduled-sync`: mover para 03:20, 11:20, 19:20.
- `imoview-scheduled-sync`: mover para 03:45, 11:45, 19:45.
- `cleanup/retention`: evitar 00:00 e 03:00; usar horarios de menor uso.

Rollback, se necessario:

```sql
-- Recriar jobs pausados ou horarios antigos exige reutilizar os comandos originais.
-- Os comandos originais estao no historico do diagnostico acima/conversa operacional.

-- Voltar horarios antigos de sync, mantendo comandos atuais:
do $$
declare
  v_vista_command text;
  v_imoview_command text;
begin
  select command into v_vista_command from cron.job where jobname = 'vista-scheduled-sync' limit 1;
  select command into v_imoview_command from cron.job where jobname = 'imoview-scheduled-sync' limit 1;

  if v_vista_command is not null then
    perform cron.unschedule('vista-scheduled-sync');
    perform cron.schedule('vista-scheduled-sync', '0 6,14,22 * * *', v_vista_command);
  end if;

  if v_imoview_command is not null then
    perform cron.unschedule('imoview-scheduled-sync');
    perform cron.schedule('imoview-scheduled-sync', '10 6,14,22 * * *', v_imoview_command);
  end if;
end $$;
```

## Correcao estrutural

1. Criar uma RPC para buscar leads por telefones normalizados usando `normalize_phone(phone)`.
2. Trocar todos os `phone.ilike.%...%` de webhooks/syncs por essa RPC.
3. No frontend, nao montar OR gigante de telefones; buscar por ids via RPC e depois carregar os relacionamentos necessarios.
4. Otimizar `notification-scheduler`:
   - filtrar `lead_tasks` por `due_date <= tomorrowEnd` ja no banco.
   - filtrar `financial_entries` por `status = pending` e `due_date <= today`.
   - adicionar/garantir indices compostos para essas consultas.
5. Adicionar monitoramento:
   - alerta para `statement timeout`.
   - contagem de execucoes por Edge Function por minuto.
   - crons ativos e crons falhando.

## Consultas uteis de acompanhamento

```sql
select jobid, jobname, schedule, active
from cron.job
order by jobname;

select d.jobid, j.jobname, d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d
left join cron.job j on j.jobid = d.jobid
where d.start_time >= now() - interval '24 hours'
order by d.start_time desc;

select pid, usename, state, wait_event_type, now() - query_start as age, left(query, 500) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
order by age desc
limit 30;
```
