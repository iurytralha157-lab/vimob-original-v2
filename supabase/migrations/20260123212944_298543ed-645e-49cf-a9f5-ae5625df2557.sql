-- Tabela de configurações de site por organização
CREATE TABLE public.organization_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  -- Domínio
  subdomain TEXT UNIQUE,
  custom_domain TEXT UNIQUE,
  domain_verified BOOLEAN NOT NULL DEFAULT false,
  domain_verified_at TIMESTAMPTZ,
  
  -- Aparência
  site_title TEXT,
  site_description TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#F97316',
  secondary_color TEXT DEFAULT '#1E293B',
  accent_color TEXT DEFAULT '#3B82F6',
  
  -- Contato
  whatsapp TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  
  -- Redes Sociais
  instagram TEXT,
  facebook TEXT,
  youtube TEXT,
  linkedin TEXT,
  
  -- Sobre
  about_title TEXT,
  about_text TEXT,
  about_image_url TEXT,
  
  -- SEO
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  google_analytics_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_org_site UNIQUE (organization_id)
);

-- Índices
CREATE INDEX idx_organization_sites_org ON public.organization_sites(organization_id);
CREATE INDEX idx_organization_sites_subdomain ON public.organization_sites(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_organization_sites_custom_domain ON public.organization_sites(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_organization_sites_active ON public.organization_sites(is_active) WHERE is_active = true;

-- Trigger para updated_at
CREATE TRIGGER update_organization_sites_updated_at
  BEFORE UPDATE ON public.organization_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.organization_sites ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their organization site"
  ON public.organization_sites FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage their organization site"
  ON public.organization_sites FOR ALL
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

CREATE POLICY "Super admins can manage all sites"
  ON public.organization_sites FOR ALL
  USING (public.is_super_admin());

-- Política pública para resolução de domínio (sem autenticação)
CREATE POLICY "Anyone can read active sites by domain"
  ON public.organization_sites FOR SELECT
  USING (is_active = true AND (subdomain IS NOT NULL OR (custom_domain IS NOT NULL AND domain_verified = true)));

-- Função para resolver domínio → organization_id
CREATE OR REPLACE FUNCTION public.resolve_site_domain(p_domain TEXT)
RETURNS TABLE (
  organization_id UUID,
  site_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site organization_sites%ROWTYPE;
  v_org organizations%ROWTYPE;
BEGIN
  -- Tentar encontrar por custom_domain primeiro
  SELECT * INTO v_site 
  FROM organization_sites 
  WHERE custom_domain = p_domain 
    AND domain_verified = true 
    AND is_active = true;
  
  -- Se não encontrou, tentar por subdomain
  IF v_site.id IS NULL THEN
    SELECT * INTO v_site 
    FROM organization_sites 
    WHERE subdomain = split_part(p_domain, '.', 1)
      AND is_active = true;
  END IF;
  
  IF v_site.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Buscar dados da organização
  SELECT * INTO v_org FROM organizations WHERE id = v_site.organization_id;
  
  RETURN QUERY SELECT 
    v_site.organization_id,
    jsonb_build_object(
      'id', v_site.id,
      'is_active', v_site.is_active,
      'subdomain', v_site.subdomain,
      'custom_domain', v_site.custom_domain,
      'site_title', COALESCE(v_site.site_title, v_org.name),
      'site_description', v_site.site_description,
      'logo_url', COALESCE(v_site.logo_url, v_org.logo_url),
      'favicon_url', v_site.favicon_url,
      'primary_color', v_site.primary_color,
      'secondary_color', v_site.secondary_color,
      'accent_color', v_site.accent_color,
      'whatsapp', v_site.whatsapp,
      'phone', v_site.phone,
      'email', v_site.email,
      'address', v_site.address,
      'city', v_site.city,
      'state', v_site.state,
      'instagram', v_site.instagram,
      'facebook', v_site.facebook,
      'youtube', v_site.youtube,
      'linkedin', v_site.linkedin,
      'about_title', v_site.about_title,
      'about_text', v_site.about_text,
      'about_image_url', v_site.about_image_url,
      'seo_title', v_site.seo_title,
      'seo_description', v_site.seo_description,
      'seo_keywords', v_site.seo_keywords,
      'google_analytics_id', v_site.google_analytics_id,
      'organization_name', v_org.name
    );
END;
$$;