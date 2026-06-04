-- Adicionar coluna created_by na tabela webhooks_integrations
ALTER TABLE public.webhooks_integrations 
ADD COLUMN created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Preencher webhooks existentes atribuindo ao primeiro admin da organização
UPDATE public.webhooks_integrations wi
SET created_by = (
  SELECT u.id FROM public.users u 
  WHERE u.organization_id = wi.organization_id 
  AND u.role = 'admin' 
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE wi.created_by IS NULL;