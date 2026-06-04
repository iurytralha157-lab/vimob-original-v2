-- Add new address fields and favicon/domain to onboarding_requests
ALTER TABLE public.onboarding_requests
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_neighborhood text,
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS company_complement text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS custom_domain text;

-- Allow anonymous uploads to logos bucket for onboarding folder
CREATE POLICY "Anon can upload onboarding logos" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = 'onboarding');

CREATE POLICY "Anon can view onboarding logos" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = 'onboarding');
