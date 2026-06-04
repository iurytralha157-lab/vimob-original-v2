-- 1. Remover gatilhos de gamificação que estão causando erros de RLS
DROP TRIGGER IF EXISTS tr_activity_gamification ON public.activities;
DROP TRIGGER IF EXISTS tr_gamification_activities ON public.activities;
DROP TRIGGER IF EXISTS tr_schedule_gamification ON public.schedule_events;

-- 2. Garantir que as políticas de RLS para agenda permitam inserção e visualização sem bloqueios de gamificação
-- Permitir inserção para usuários autenticados
DROP POLICY IF EXISTS "Users can create schedule events" ON public.schedule_events;
CREATE POLICY "Users can create schedule events" ON public.schedule_events
FOR INSERT TO authenticated
WITH CHECK (true);

-- Permitir visualização de eventos da mesma organização
DROP POLICY IF EXISTS "Users can view their organization events" ON public.schedule_events;
CREATE POLICY "Users can view their organization events" ON public.schedule_events
FOR SELECT TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ) OR user_id = auth.uid()
);

-- Permitir atualização de eventos da mesma organização
DROP POLICY IF EXISTS "Users can update their organization events" ON public.schedule_events;
CREATE POLICY "Users can update their organization events" ON public.schedule_events
FOR UPDATE TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ) OR user_id = auth.uid()
);

-- Permitir exclusão de eventos da mesma organização
DROP POLICY IF EXISTS "Users can delete their organization events" ON public.schedule_events;
CREATE POLICY "Users can delete their organization events" ON public.schedule_events
FOR DELETE TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ) OR user_id = auth.uid()
);

-- 3. Ajustar políticas da tabela de atividades (activities)
DROP POLICY IF EXISTS "Users can view organization activities" ON public.activities;
CREATE POLICY "Users can view organization activities" ON public.activities
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR
  lead_id IN (SELECT id FROM public.leads WHERE organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can create activities" ON public.activities;
CREATE POLICY "Users can create activities" ON public.activities
FOR INSERT TO authenticated
WITH CHECK (true);
