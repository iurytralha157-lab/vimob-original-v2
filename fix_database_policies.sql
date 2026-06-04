-- Ajustar políticas de RLS para a tabela activities para serem mais robustas
DROP POLICY IF EXISTS "Users can create activities" ON public.activities;
CREATE POLICY "Users can create activities" ON public.activities
FOR INSERT TO authenticated
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  )
  OR 
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Garantir políticas para schedule_events
DROP POLICY IF EXISTS "Admins can insert events for others" ON public.schedule_events;
CREATE POLICY "Admins can insert events for others" ON public.schedule_events
FOR INSERT TO authenticated
WITH CHECK (
  (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())) 
  AND 
  (user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin' OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin')
);

-- Habilitar RLS em gamification_activity_logs se não estiver e adicionar política
ALTER TABLE public.gamification_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own gamification logs" ON public.gamification_activity_logs;
CREATE POLICY "Users can view own gamification logs" ON public.gamification_activity_logs
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'super_admin'));
