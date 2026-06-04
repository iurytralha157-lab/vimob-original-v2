create table public.schedule_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Habilitar RLS
alter table public.schedule_event_comments enable row level security;

-- Política de visualização (membros da organização)
create policy "Membros podem ver comentários de seus eventos"
on public.schedule_event_comments
for select
to authenticated
using (
  organization_id = (select organization_id from public.profiles where id = auth.uid())
);

-- Política de inserção
create policy "Usuários podem comentar em eventos da sua organização"
on public.schedule_event_comments
for insert
to authenticated
with check (
  organization_id = (select organization_id from public.profiles where id = auth.uid())
);

-- Índices para performance
create index idx_schedule_comments_event_id on public.schedule_event_comments(event_id);
create index idx_schedule_comments_org_id on public.schedule_event_comments(organization_id);

-- Trigger para notificações e histórico seria ideal, mas faremos via hook/RPC inicialmente para controle fino
