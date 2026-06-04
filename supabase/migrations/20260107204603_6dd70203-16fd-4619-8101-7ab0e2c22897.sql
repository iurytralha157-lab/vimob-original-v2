-- Tabela de equipes
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org teams" ON public.teams
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage teams" ON public.teams
  FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- Membros da equipe
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team members" ON public.team_members
  FOR SELECT USING (team_id IN (SELECT id FROM public.teams WHERE organization_id = get_user_organization_id()));

CREATE POLICY "Admins can manage team members" ON public.team_members
  FOR ALL USING (team_id IN (SELECT id FROM public.teams WHERE organization_id = get_user_organization_id()) AND is_admin());

-- Tipos de imovel customizados
CREATE TABLE public.property_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE public.property_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property types" ON public.property_types
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage property types" ON public.property_types
  FOR ALL USING (organization_id = get_user_organization_id());

-- Convites
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT,
  token TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  role public.app_role DEFAULT 'user',
  created_by UUID REFERENCES public.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations" ON public.invitations
  FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Anyone can view invitation by token" ON public.invitations
  FOR SELECT USING (true);

-- Alterar round_robin_members para aceitar team_id
ALTER TABLE public.round_robin_members ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- Adicionar campos extras em properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS area_total NUMERIC;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS andar INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS ano_construcao INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS imagem_principal TEXT;

-- Criar buckets de storage
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('properties', 'properties', true),
  ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para storage de properties
CREATE POLICY "Anyone can view property images" ON storage.objects
  FOR SELECT USING (bucket_id = 'properties');

CREATE POLICY "Authenticated users can upload property images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'properties' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update property images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'properties' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete property images" ON storage.objects
  FOR DELETE USING (bucket_id = 'properties' AND auth.role() = 'authenticated');

-- Policies para storage de logos
CREATE POLICY "Anyone can view logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can upload logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');