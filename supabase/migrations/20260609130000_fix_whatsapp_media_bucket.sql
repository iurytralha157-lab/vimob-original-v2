-- Fix whatsapp-media bucket: add audio/webm to allowed_mime_types
-- and ensure public read policy exists (bucket is public=true, needs SELECT policy)

-- Add audio/webm to the allowed MIME types for the whatsapp-media bucket
-- This is needed because browsers (Chrome/Firefox) record audio as audio/webm by default.
UPDATE storage.buckets
SET allowed_mime_types = array_append(
  COALESCE(allowed_mime_types, ARRAY[]::text[]),
  'audio/webm'
)
WHERE id = 'whatsapp-media'
  AND NOT ('audio/webm' = ANY(COALESCE(allowed_mime_types, ARRAY[]::text[])));

-- Also add audio/webm;codecs=opus variant
UPDATE storage.buckets
SET allowed_mime_types = array_append(
  COALESCE(allowed_mime_types, ARRAY[]::text[]),
  'audio/webm;codecs=opus'
)
WHERE id = 'whatsapp-media'
  AND NOT ('audio/webm;codecs=opus' = ANY(COALESCE(allowed_mime_types, ARRAY[]::text[])));

-- Ensure there is a public SELECT policy (the bucket is public=true, but needs RLS policy for SELECT)
-- This allows the browser to display media via public URLs
DROP POLICY IF EXISTS "Public read access whatsapp-media" ON storage.objects;
CREATE POLICY "Public read access whatsapp-media" ON storage.objects
FOR SELECT USING (bucket_id = 'whatsapp-media');
