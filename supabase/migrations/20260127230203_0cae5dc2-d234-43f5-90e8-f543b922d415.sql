-- Enable RLS on organization_sites table
ALTER TABLE public.organization_sites ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access ONLY for active sites (needed for public website display)
CREATE POLICY "Public can read active sites"
ON public.organization_sites
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Policy: Organization members can read their own site (even if inactive)
CREATE POLICY "Org members can read own site"
ON public.organization_sites
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  )
);

-- Policy: Organization admins can insert their site
CREATE POLICY "Org admins can insert site"
ON public.organization_sites
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Organization admins can update their site
CREATE POLICY "Org admins can update site"
ON public.organization_sites
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Organization admins can delete their site
CREATE POLICY "Org admins can delete site"
ON public.organization_sites
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Super admins have full access
CREATE POLICY "Super admins have full access to sites"
ON public.organization_sites
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());