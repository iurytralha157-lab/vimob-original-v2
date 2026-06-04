CREATE TABLE IF NOT EXISTS public.onboarding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  company_name text NOT NULL,
  cnpj text,
  company_address text,
  company_phone text,
  company_whatsapp text,
  company_email text,
  segment text DEFAULT 'imobiliario',
  responsible_name text NOT NULL,
  responsible_email text NOT NULL,
  responsible_cpf text,
  responsible_phone text,
  logo_url text,
  primary_color text DEFAULT '#3b82f6',
  secondary_color text,
  site_title text,
  site_seo_description text,
  about_text text,
  banner_url text,
  banner_title text,
  instagram text,
  facebook text,
  youtube text,
  linkedin text,
  team_size text DEFAULT '1-5',
  admin_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own onboarding requests"
ON public.onboarding_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own onboarding requests"
ON public.onboarding_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all onboarding requests"
ON public.onboarding_requests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admins can update onboarding requests"
ON public.onboarding_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_onboarding_requests_status ON public.onboarding_requests(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_user_id ON public.onboarding_requests(user_id);
