-- Drop existing insecure policies for storage.objects
DROP POLICY IF EXISTS "Authenticated users can delete automation media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload automation media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;

-- Create a helper function for robust organization access check
CREATE OR REPLACE FUNCTION public.check_storage_org_access(org_id_text text)
RETURNS boolean AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Try to parse the text as UUID. If it fails, it's not an org_id folder.
  BEGIN
    org_id := org_id_text::uuid;
  EXCEPTION WHEN others THEN
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND (
      u.organization_id = org_id
      OR u.role = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = u.id AND om.organization_id = org_id
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Logos bucket policies
CREATE POLICY "Users can manage their own organization logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'logos' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] NOT IN ('system', 'onboarding') AND
      public.check_storage_org_access((storage.foldername(name))[1])
    )
  )
)
WITH CHECK (
  bucket_id = 'logos' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] NOT IN ('system', 'onboarding') AND
      public.check_storage_org_access((storage.foldername(name))[1])
    )
  )
);

-- Properties bucket policies
CREATE POLICY "Users can manage their own organization properties"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'properties' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'orgs' AND
      public.check_storage_org_access((storage.foldername(name))[2])
    )
  )
)
WITH CHECK (
  bucket_id = 'properties' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'orgs' AND
      public.check_storage_org_access((storage.foldername(name))[2])
    )
  )
);

-- Whatsapp-media bucket policies
CREATE POLICY "Users can manage their own organization whatsapp-media"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'whatsapp-media' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'orgs' AND
      public.check_storage_org_access((storage.foldername(name))[2])
    )
  )
)
WITH CHECK (
  bucket_id = 'whatsapp-media' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'orgs' AND
      public.check_storage_org_access((storage.foldername(name))[2])
    )
  )
);

-- Automation-media bucket policies
CREATE POLICY "Users can manage their own organization automation-media"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'automation-media' AND (
    public.is_super_admin() OR
    public.check_storage_org_access((storage.foldername(name))[1])
  )
)
WITH CHECK (
  bucket_id = 'automation-media' AND (
    public.is_super_admin() OR
    public.check_storage_org_access((storage.foldername(name))[1])
  )
);

-- Avatars bucket policies
CREATE POLICY "Users can manage their own avatar"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'avatars' AND
      split_part(name, '/', 2) LIKE (auth.uid()::text || '%')
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND (
    public.is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'avatars' AND
      split_part(name, '/', 2) LIKE (auth.uid()::text || '%')
    )
  )
);
