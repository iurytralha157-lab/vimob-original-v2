-- Ensure site-images bucket is correctly configured
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop any conflicting or restrictive policies for site-images
DROP POLICY IF EXISTS "Admins can manage site-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access site-images" ON storage.objects;

-- Create permissive policies for site-images
CREATE POLICY "Public Read site-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-images');

CREATE POLICY "Authenticated Manage site-images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'site-images')
WITH CHECK (bucket_id = 'site-images');

-- Also fix logos bucket policies to allow site and onboarding uploads for authenticated users
-- Drop the restrictive "Org members manage logos" and replace with a more flexible one
DROP POLICY IF EXISTS "Org members manage logos" ON storage.objects;

CREATE POLICY "Authenticated Manage logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'logos' AND (
    is_super_admin() OR 
    check_storage_org_access((storage.foldername(name))[1]) OR
    (storage.foldername(name))[1] = 'sites' OR
    (storage.foldername(name))[1] = 'onboarding'
  )
)
WITH CHECK (
  bucket_id = 'logos' AND (
    is_super_admin() OR 
    check_storage_org_access((storage.foldername(name))[1]) OR
    (storage.foldername(name))[1] = 'sites' OR
    (storage.foldername(name))[1] = 'onboarding'
  )
);
