
-- Table for Imoview integration config (mirrors vista_integrations)
CREATE TABLE public.imoview_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  total_synced INTEGER DEFAULT 0,
  sync_log JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.imoview_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org imoview integration"
  ON public.imoview_integrations
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Add imoview_codigo to properties for upsert matching
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS imoview_codigo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_org_imoview ON public.properties(organization_id, imoview_codigo) WHERE imoview_codigo IS NOT NULL;
