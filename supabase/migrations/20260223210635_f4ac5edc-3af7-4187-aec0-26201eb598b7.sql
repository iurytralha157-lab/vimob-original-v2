
-- Create site_menu_items table
CREATE TABLE public.site_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('page', 'filter', 'external')),
  href TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  open_in_new_tab BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_menu_items ENABLE ROW LEVEL SECURITY;

-- Public can read active menu items
CREATE POLICY "Public can read active menu items"
  ON public.site_menu_items FOR SELECT
  USING (is_active = true);

-- Org members can manage their menu items
CREATE POLICY "Org members can manage menu items"
  ON public.site_menu_items FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_site_menu_items_org ON public.site_menu_items(organization_id, position);
