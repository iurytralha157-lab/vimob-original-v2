-- =====================================================
-- STORAGE POLICIES SEGURAS POR ORGANIZAÇÃO
-- =====================================================

-- Remover policies permissivas existentes
DROP POLICY IF EXISTS "Authenticated users can delete property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;

-- =====================================================
-- BUCKET: properties - Estrutura: /orgs/{org_id}/...
-- =====================================================

-- SELECT: público (bucket já é público)
-- Manter policy existente de leitura pública

-- INSERT: apenas usuários da org podem fazer upload
DROP POLICY IF EXISTS "Org users can upload properties" ON storage.objects;
CREATE POLICY "Org users can upload properties" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'properties' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

-- UPDATE: apenas usuários da org podem atualizar
DROP POLICY IF EXISTS "Org users can update properties" ON storage.objects;
CREATE POLICY "Org users can update properties" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'properties' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

-- DELETE: apenas admins da org podem deletar
DROP POLICY IF EXISTS "Org admins can delete properties" ON storage.objects;
CREATE POLICY "Org admins can delete properties" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'properties' AND public.is_admin() AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

-- =====================================================
-- BUCKET: logos - Estrutura: /orgs/{org_id}/...
-- =====================================================

DROP POLICY IF EXISTS "Org users can upload logos" ON storage.objects;
CREATE POLICY "Org users can upload logos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org users can update logos" ON storage.objects;
CREATE POLICY "Org users can update logos" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org admins can delete logos" ON storage.objects;
CREATE POLICY "Org admins can delete logos" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'logos' AND public.is_admin() AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

-- =====================================================
-- BUCKET: avatars - Estrutura: /orgs/{org_id}/users/{user_id}/...
-- =====================================================

DROP POLICY IF EXISTS "Org users can upload avatars" ON storage.objects;
CREATE POLICY "Org users can upload avatars" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org users can update avatars" ON storage.objects;
CREATE POLICY "Org users can update avatars" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org admins can delete avatars" ON storage.objects;
CREATE POLICY "Org admins can delete avatars" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'avatars' AND public.is_admin() AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

-- =====================================================
-- BUCKET: whatsapp-media - Estrutura: /orgs/{org_id}/sessions/{session_id}/...
-- =====================================================

-- Atualizar policy de upload existente para validar org_id
DROP POLICY IF EXISTS "Authenticated can upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Org users can upload whatsapp media" ON storage.objects;
CREATE POLICY "Org users can upload whatsapp media" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'whatsapp-media' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org users can update whatsapp media" ON storage.objects;
CREATE POLICY "Org users can update whatsapp media" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'whatsapp-media' AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);

DROP POLICY IF EXISTS "Org admins can delete whatsapp media" ON storage.objects;
CREATE POLICY "Org admins can delete whatsapp media" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'whatsapp-media' AND public.is_admin() AND (
    (storage.foldername(name))[1] = 'orgs' AND
    (storage.foldername(name))[2]::uuid = public.auth_org_id()
  )
);