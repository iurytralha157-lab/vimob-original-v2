
-- Criar função para obter IDs dos membros das equipes lideradas pelo usuário
CREATE OR REPLACE FUNCTION public.get_led_team_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.user_id 
  FROM public.team_members tm
  WHERE tm.team_id IN (
    SELECT team_id FROM public.team_members 
    WHERE user_id = auth.uid() AND is_leader = true
  )
$$;

-- Remover políticas antigas de leads
DROP POLICY IF EXISTS "Users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Leads organization isolation with team filter" ON public.leads;
DROP POLICY IF EXISTS "Users can view organization leads" ON public.leads;

-- Criar nova política ESTRITA para leads (SEM FALLBACK)
CREATE POLICY "Strict lead visibility"
ON public.leads
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Admin vê todos os leads da organização
    is_admin()
    -- Líder de equipe vê leads de pipelines da equipe OU leads de membros da equipe
    OR (
      is_team_leader() 
      AND (
        pipeline_id IN (
          SELECT pipeline_id FROM public.team_pipelines 
          WHERE team_id IN (SELECT get_user_led_team_ids())
        )
        OR assigned_user_id IN (SELECT get_led_team_member_ids())
      )
    )
    -- Usuário comum: APENAS leads atribuídos a ele
    OR assigned_user_id = auth.uid()
  )
);

-- Remover políticas antigas de pipelines
DROP POLICY IF EXISTS "Users can view pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Pipelines organization isolation with team access" ON public.pipelines;
DROP POLICY IF EXISTS "Users can view organization pipelines" ON public.pipelines;

-- Criar nova política ESTRITA para pipelines (SEM FALLBACK)
CREATE POLICY "Strict pipeline visibility"
ON public.pipelines
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Admin vê todas as pipelines
    is_admin()
    -- Líder de equipe vê pipelines da sua equipe
    OR (
      is_team_leader() 
      AND id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_led_team_ids())
      )
    )
    -- Membro de equipe vê pipelines da sua equipe
    OR id IN (
      SELECT pipeline_id FROM public.team_pipelines 
      WHERE team_id IN (SELECT get_user_team_ids())
    )
  )
);

-- Remover políticas antigas de stages (stages seguem a visibilidade das pipelines)
DROP POLICY IF EXISTS "Users can view stages" ON public.stages;
DROP POLICY IF EXISTS "Stages follow pipeline visibility" ON public.stages;

-- Criar nova política ESTRITA para stages
CREATE POLICY "Strict stage visibility"
ON public.stages
FOR SELECT
USING (
  pipeline_id IN (
    SELECT id FROM public.pipelines
    WHERE organization_id = get_user_organization_id()
    AND (
      is_admin()
      OR (
        is_team_leader() 
        AND id IN (
          SELECT pipeline_id FROM public.team_pipelines 
          WHERE team_id IN (SELECT get_user_led_team_ids())
        )
      )
      OR id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_team_ids())
      )
    )
  )
);
