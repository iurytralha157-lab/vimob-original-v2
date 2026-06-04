-- Jenny AI control plane.
-- Goal: one global product agent, organization-scoped data access, cost limits,
-- auditability, preview mode, and a backend-ready contract.

create table if not exists public.ai_global_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  provider text not null default 'openai',
  default_model text not null default 'gpt-4.1-nano',
  fallback_model text not null default 'gpt-4o-mini',
  system_prompt text not null default 'Voce e a Jenny, assistente comercial do CRM Vimob. Atenda com clareza, objetividade e cuidado com dados pessoais.',
  safety_prompt text not null default 'Nunca misture dados entre organizacoes. Use apenas o contexto autorizado da organizacao atual. Se faltar informacao, pergunte ou acione humano.',
  is_active boolean not null default true,
  temperature numeric(3,2) not null default 0.20,
  max_output_tokens integer not null default 420,
  max_context_messages integer not null default 12,
  monthly_token_budget integer not null default 250000,
  daily_token_budget integer not null default 15000,
  lgpd_mode text not null default 'strict',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_global_agents_lgpd_mode_check check (lgpd_mode in ('strict', 'balanced')),
  constraint ai_global_agents_temperature_check check (temperature >= 0 and temperature <= 1),
  constraint ai_global_agents_max_output_check check (max_output_tokens between 80 and 4000)
);

create table if not exists public.ai_global_agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_global_agents(id) on delete cascade,
  version integer not null,
  system_prompt text not null,
  safety_prompt text not null,
  model text not null,
  change_notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

create table if not exists public.ai_organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_global_agents(id) on delete restrict,
  is_enabled boolean not null default false,
  mode text not null default 'preview',
  allowed_contexts text[] not null default array['lead_basic','conversation_recent']::text[],
  blocked_contexts text[] not null default array[]::text[],
  organization_prompt text not null default '',
  business_rules text not null default '',
  handoff_keywords text[] not null default array['humano','atendente','corretor','ligar','reclamar','cancelar']::text[],
  quiet_hours jsonb not null default '{"enabled":false,"timezone":"America/Sao_Paulo","start":"20:00","end":"08:00"}'::jsonb,
  require_human_approval boolean not null default true,
  max_response_delay_seconds integer not null default 20,
  daily_token_budget integer not null default 3000,
  monthly_token_budget integer not null default 60000,
  max_output_tokens integer not null default 360,
  max_context_messages integer not null default 8,
  pii_redaction_enabled boolean not null default true,
  store_ai_outputs boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, agent_id),
  constraint ai_org_settings_mode_check check (mode in ('off','preview','assist','auto')),
  constraint ai_org_settings_delay_check check (max_response_delay_seconds between 0 and 300),
  constraint ai_org_settings_output_check check (max_output_tokens between 80 and 2000)
);

create table if not exists public.ai_conversation_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  agent_id uuid not null references public.ai_global_agents(id) on delete restrict,
  status text not null default 'idle',
  automation_enabled boolean not null default true,
  human_handoff_at timestamptz,
  human_handoff_reason text,
  last_response_id text,
  summary text,
  intent text,
  sentiment text,
  last_user_message_at timestamptz,
  last_ai_message_at timestamptz,
  total_messages integer not null default 0,
  total_ai_replies integer not null default 0,
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, conversation_id),
  constraint ai_conversation_states_status_check check (status in ('idle','queued','processing','waiting_approval','auto_replied','handed_off','blocked','error'))
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  agent_id uuid not null references public.ai_global_agents(id) on delete restrict,
  source text not null default 'whatsapp',
  status text not null default 'pending',
  priority integer not null default 5,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_jobs_status_check check (status in ('pending','processing','completed','failed','cancelled','skipped'))
);

create table if not exists public.ai_outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  agent_id uuid not null references public.ai_global_agents(id) on delete restrict,
  job_id uuid references public.ai_jobs(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'draft',
  content text not null,
  approval_required boolean not null default true,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  sent_message_id uuid references public.whatsapp_messages(id) on delete set null,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_outbox_status_check check (status in ('draft','pending_approval','approved','sending','sent','failed','cancelled'))
);

create table if not exists public.ai_interaction_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  agent_id uuid references public.ai_global_agents(id) on delete set null,
  job_id uuid references public.ai_jobs(id) on delete set null,
  mode text not null default 'preview',
  event_type text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  latency_ms integer,
  success boolean not null default true,
  error_message text,
  input_preview text,
  output_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_preview_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_global_agents(id) on delete restrict,
  title text not null default 'Teste da Jenny',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_preview_messages (
  id uuid primary key default gen_random_uuid(),
  preview_session_id uuid not null references public.ai_preview_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_preview_messages_role_check check (role in ('user','assistant','system'))
);

create index if not exists idx_ai_org_settings_org on public.ai_organization_settings (organization_id);
create index if not exists idx_ai_conversation_states_org on public.ai_conversation_states (organization_id, updated_at desc);
create index if not exists idx_ai_jobs_pending on public.ai_jobs (status, scheduled_at, priority) where status = 'pending';
create index if not exists idx_ai_outbox_pending on public.ai_outbox_messages (status, created_at) where status in ('draft','pending_approval','approved');
create index if not exists idx_ai_interaction_logs_created on public.ai_interaction_logs (created_at desc);
create index if not exists idx_ai_interaction_logs_org_created on public.ai_interaction_logs (organization_id, created_at desc);
create index if not exists idx_ai_preview_messages_session on public.ai_preview_messages (preview_session_id, created_at);

alter table public.ai_global_agents enable row level security;
alter table public.ai_global_agent_versions enable row level security;
alter table public.ai_organization_settings enable row level security;
alter table public.ai_conversation_states enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_outbox_messages enable row level security;
alter table public.ai_interaction_logs enable row level security;
alter table public.ai_preview_sessions enable row level security;
alter table public.ai_preview_messages enable row level security;

drop policy if exists "super admins manage ai global agents" on public.ai_global_agents;
create policy "super admins manage ai global agents"
  on public.ai_global_agents for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "super admins manage ai global versions" on public.ai_global_agent_versions;
create policy "super admins manage ai global versions"
  on public.ai_global_agent_versions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "super admins manage ai org settings" on public.ai_organization_settings;
create policy "super admins manage ai org settings"
  on public.ai_organization_settings for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "org admins view ai org settings" on public.ai_organization_settings;
create policy "org admins view ai org settings"
  on public.ai_organization_settings for select
  using (public.user_belongs_to_organization(organization_id) and public.is_admin());

drop policy if exists "super admins view ai conversation states" on public.ai_conversation_states;
create policy "super admins view ai conversation states"
  on public.ai_conversation_states for select
  using (public.is_super_admin() or public.user_belongs_to_organization(organization_id));

drop policy if exists "super admins view ai jobs" on public.ai_jobs;
create policy "super admins view ai jobs"
  on public.ai_jobs for select
  using (public.is_super_admin() or public.user_belongs_to_organization(organization_id));

drop policy if exists "super admins manage ai outbox" on public.ai_outbox_messages;
create policy "super admins manage ai outbox"
  on public.ai_outbox_messages for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "org users view ai outbox" on public.ai_outbox_messages;
create policy "org users view ai outbox"
  on public.ai_outbox_messages for select
  using (public.user_belongs_to_organization(organization_id));

drop policy if exists "super admins view ai logs" on public.ai_interaction_logs;
create policy "super admins view ai logs"
  on public.ai_interaction_logs for select
  using (public.is_super_admin() or (organization_id is not null and public.user_belongs_to_organization(organization_id)));

drop policy if exists "super admins manage ai preview sessions" on public.ai_preview_sessions;
create policy "super admins manage ai preview sessions"
  on public.ai_preview_sessions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "super admins manage ai preview messages" on public.ai_preview_messages;
create policy "super admins manage ai preview messages"
  on public.ai_preview_messages for all
  using (
    public.is_super_admin()
    and exists (
      select 1 from public.ai_preview_sessions s
      where s.id = preview_session_id
    )
  )
  with check (
    public.is_super_admin()
    and exists (
      select 1 from public.ai_preview_sessions s
      where s.id = preview_session_id
    )
  );

create or replace function public.update_ai_control_plane_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_ai_global_agents_updated_at on public.ai_global_agents;
create trigger update_ai_global_agents_updated_at
  before update on public.ai_global_agents
  for each row execute function public.update_ai_control_plane_updated_at();

drop trigger if exists update_ai_organization_settings_updated_at on public.ai_organization_settings;
create trigger update_ai_organization_settings_updated_at
  before update on public.ai_organization_settings
  for each row execute function public.update_ai_control_plane_updated_at();

drop trigger if exists update_ai_conversation_states_updated_at on public.ai_conversation_states;
create trigger update_ai_conversation_states_updated_at
  before update on public.ai_conversation_states
  for each row execute function public.update_ai_control_plane_updated_at();

drop trigger if exists update_ai_outbox_messages_updated_at on public.ai_outbox_messages;
create trigger update_ai_outbox_messages_updated_at
  before update on public.ai_outbox_messages
  for each row execute function public.update_ai_control_plane_updated_at();

drop trigger if exists update_ai_preview_sessions_updated_at on public.ai_preview_sessions;
create trigger update_ai_preview_sessions_updated_at
  before update on public.ai_preview_sessions
  for each row execute function public.update_ai_control_plane_updated_at();

insert into public.ai_global_agents (slug, name, description)
values (
  'jenny',
  'Jenny',
  'IA global do Vimob para atendimento comercial multi-organizacao com isolamento de dados.'
)
on conflict (slug) do nothing;

insert into public.ai_global_agent_versions (
  agent_id,
  version,
  system_prompt,
  safety_prompt,
  model,
  change_notes
)
select id, 1, system_prompt, safety_prompt, default_model, 'Versao inicial LGPD-first e budget-first.'
from public.ai_global_agents
where slug = 'jenny'
on conflict (agent_id, version) do nothing;
