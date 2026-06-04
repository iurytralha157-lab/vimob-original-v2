-- =====================================================================
-- API Pública: tabela organization_api_keys com hash + RPC de geração
-- Aplicar manualmente via Supabase SQL Editor
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS public.organization_api_keys CASCADE;

CREATE TABLE public.organization_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Chave Padrão',
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_org_api_keys_org ON public.organization_api_keys(organization_id);
CREATE INDEX idx_org_api_keys_hash ON public.organization_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = _org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role IN ('admin', 'super_admin')
  );
$$;

CREATE POLICY "org admins read api keys"
  ON public.organization_api_keys
  FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "org admins delete api keys"
  ON public.organization_api_keys
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "deny direct insert"
  ON public.organization_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.tg_org_api_keys_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER set_org_api_keys_updated_at
  BEFORE UPDATE ON public.organization_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_api_keys_updated_at();

-- RPC: gera chave nova, persiste apenas o hash, retorna a chave UMA VEZ
CREATE OR REPLACE FUNCTION public.generate_organization_api_key(
  p_organization_id UUID,
  p_name TEXT DEFAULT 'Chave Padrão'
)
RETURNS TABLE (
  id UUID,
  api_key TEXT,
  key_prefix TEXT,
  name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_random TEXT;
  v_key TEXT;
  v_hash TEXT;
  v_prefix TEXT;
  v_id UUID;
  v_created TIMESTAMPTZ;
  v_clean_name TEXT;
BEGIN
  IF NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden: only organization admins can create API keys'
      USING ERRCODE = '42501';
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_name), ''), 'Chave Padrão');
  v_random := encode(gen_random_bytes(32), 'hex');
  v_key := 'sk_live_' || v_random;
  v_hash := encode(digest(v_key, 'sha256'), 'hex');
  v_prefix := substring(v_key, 1, 12);
  v_id := gen_random_uuid();
  v_created := NOW();

  INSERT INTO public.organization_api_keys
    (id, organization_id, key_hash, key_prefix, name, created_by, created_at, updated_at)
  VALUES
    (v_id, p_organization_id, v_hash, v_prefix, v_clean_name, auth.uid(), v_created, v_created);

  RETURN QUERY SELECT v_id, v_key, v_prefix, v_clean_name, v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_organization_api_key(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_organization_api_key(UUID, TEXT) TO authenticated;
