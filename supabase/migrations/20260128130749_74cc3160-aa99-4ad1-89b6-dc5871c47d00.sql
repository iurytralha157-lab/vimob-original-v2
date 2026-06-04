-- Criar política específica para INSERT que permite criar leads para outros usuários
-- Admins, super admins e usuários com lead_edit_all podem criar leads atribuídos a qualquer membro da org

CREATE POLICY "Allow lead creation by authorized users"
ON public.leads
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('lead_edit_all'::text, auth.uid())
    OR assigned_user_id = auth.uid()
    OR assigned_user_id IS NULL
  )
);