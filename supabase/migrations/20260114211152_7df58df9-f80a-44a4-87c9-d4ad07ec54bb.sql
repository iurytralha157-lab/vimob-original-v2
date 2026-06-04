-- Remover política antiga que permite ver notificações de toda organização
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;

-- Criar nova política - usuários só veem suas próprias notificações
CREATE POLICY "Users can view their own notifications"
  ON public.notifications 
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins podem ver todas as notificações da organização (para gerenciamento)
CREATE POLICY "Admins can view all org notifications"
  ON public.notifications 
  FOR SELECT
  USING (
    organization_id = get_user_organization_id() 
    AND is_admin()
  );