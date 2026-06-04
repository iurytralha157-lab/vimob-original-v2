-- Create storage bucket for automation media
INSERT INTO storage.buckets (id, name, public)
VALUES ('automation-media', 'automation-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to automation-media bucket
CREATE POLICY "Authenticated users can upload automation media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'automation-media');

-- Allow authenticated users to view automation media
CREATE POLICY "Anyone can view automation media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'automation-media');

-- Allow authenticated users to delete their own media
CREATE POLICY "Authenticated users can delete automation media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'automation-media');