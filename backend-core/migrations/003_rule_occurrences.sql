create table if not exists rule_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rule_key text not null,
  registry_id text not null default '',
  occurrence_key text not null,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, rule_key, registry_id, occurrence_key)
);

create index if not exists idx_rule_occurrences_org_rule_created
  on rule_occurrences (organization_id, rule_key, created_at desc);
