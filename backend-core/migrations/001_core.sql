create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  registry_source text not null default 'whatsapp',
  registry_id text not null,
  registry_id_original text,
  display_name text not null default '',
  phone_e164 text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, registry_source, registry_id)
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  name text not null default '',
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  registry_id text not null,
  status text not null default 'bot_qualifying',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  direction text not null,
  content text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists conversation_ai_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  registry_id text not null,
  conversation_id uuid references conversations(id) on delete set null,
  status text not null default 'active',
  last_response_id text,
  last_response_at timestamptz,
  context_reset_at timestamptz,
  context_version integer not null default 1,
  summary text not null default '',
  intent text not null default '',
  sentiment text not null default '',
  qualification_score integer not null default 0,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, registry_id)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  registry_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  title text not null,
  status text not null default 'open',
  due_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  ref_id uuid,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 5,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_pending on jobs (status, scheduled_at, priority desc);
create index if not exists idx_jobs_type_pending on jobs (type, status, scheduled_at);
create index if not exists idx_events_org_type_created on events (organization_id, type, created_at desc);
create index if not exists idx_conversation_ai_state_registry on conversation_ai_state (organization_id, registry_id);
create index if not exists idx_outbox_pending on outbox_messages (status, scheduled_at);
