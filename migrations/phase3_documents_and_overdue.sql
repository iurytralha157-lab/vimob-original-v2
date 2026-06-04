-- ============================================================
-- FASE 3: Bucket de documentos + cron de atraso
-- ============================================================

-- 1) Bucket privado para documentos de contratos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-documents',
  'contract-documents',
  false,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'image/jpeg','image/png','image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) RLS: usuários só acessam documentos da própria organização
--    Pastas: {organization_id}/{contract_id}/{file}
DROP POLICY IF EXISTS "contract_docs_select" ON storage.objects;
CREATE POLICY "contract_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contract-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contract_docs_insert" ON storage.objects;
CREATE POLICY "contract_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contract-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contract_docs_delete" ON storage.objects;
CREATE POLICY "contract_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'contract-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- 3) Função que marca lançamentos vencidos como 'overdue'
CREATE OR REPLACE FUNCTION public.mark_overdue_financial_entries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.financial_entries
     SET status = 'overdue',
         updated_at = now()
   WHERE status = 'pending'
     AND due_date IS NOT NULL
     AND due_date < CURRENT_DATE;
END;
$$;

-- 4) Cron diário às 03:00 (server UTC). Requer pg_cron habilitado.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-overdue-financial-entries') THEN
    PERFORM cron.unschedule('mark-overdue-financial-entries');
  END IF;
  PERFORM cron.schedule(
    'mark-overdue-financial-entries',
    '0 3 * * *',
    $cron$ SELECT public.mark_overdue_financial_entries(); $cron$
  );
END$$;
