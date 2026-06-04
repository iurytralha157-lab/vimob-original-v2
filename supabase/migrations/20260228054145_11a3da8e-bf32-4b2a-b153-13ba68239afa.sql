
-- Tabela de configuração da integração Vista
CREATE TABLE public.vista_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  import_inactive BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  total_synced INTEGER DEFAULT 0,
  sync_log JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- RLS
ALTER TABLE public.vista_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org vista integration"
ON public.vista_integrations FOR ALL
USING (public.user_belongs_to_organization(organization_id));

-- Coluna extra na properties para rastrear origem Vista
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS vista_codigo TEXT;

-- Índice único para evitar duplicatas no upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_vista_codigo_org 
  ON public.properties(organization_id, vista_codigo) WHERE vista_codigo IS NOT NULL;
