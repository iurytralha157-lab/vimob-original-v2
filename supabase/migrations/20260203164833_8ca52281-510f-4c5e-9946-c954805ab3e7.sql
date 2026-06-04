-- =============================================
-- VISIBILIDADE DE PIPELINE PARA LÍDERES DE EQUIPE
-- =============================================

-- 1. Criar função que retorna IDs das pipelines vinculadas às equipes lideradas pelo usuário
CREATE OR REPLACE FUNCTION public.get_user_led_pipeline_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT tp.pipeline_id
  FROM team_pipelines tp
  INNER JOIN team_members tm ON tm.team_id = tp.team_id
  WHERE tm.user_id = auth.uid()
    AND tm.is_leader = true;
$$;

-- 2. Atualizar política de SELECT para leads (adicionar visibilidade por pipeline vinculada)
DROP POLICY IF EXISTS "Hierarchical lead access" ON public.leads;

CREATE POLICY "Hierarchical lead access" ON public.leads
FOR SELECT USING (
  organization_id = get_user_organization_id() 
  AND (
    -- Super admin ou admin da organização
    is_super_admin() OR is_admin()
    OR
    -- Usuário com permissão lead_view_all
    user_has_permission('lead_view_all', auth.uid())
    OR
    -- Lead atribuído ao próprio usuário
    assigned_user_id = auth.uid()
    OR
    -- NOVO: Líder de equipe pode ver todos os leads em pipelines vinculadas à sua equipe
    (
      is_team_leader(auth.uid()) AND
      pipeline_id IN (SELECT get_user_led_pipeline_ids())
    )
    OR
    -- Líder pode ver leads de membros da sua equipe (lógica existente)
    (
      is_team_leader(auth.uid()) AND
      assigned_user_id IN (
        SELECT tm.user_id 
        FROM team_members tm 
        WHERE tm.team_id IN (SELECT get_user_led_team_ids())
      )
    )
    OR
    -- Usuário com permissão lead_view_team
    (
      user_has_permission('lead_view_team', auth.uid()) AND
      assigned_user_id IN (
        SELECT tm2.user_id 
        FROM team_members tm2 
        WHERE tm2.team_id IN (
          SELECT tm3.team_id 
          FROM team_members tm3 
          WHERE tm3.user_id = auth.uid()
        )
      )
    )
  )
);

-- 3. Atualizar política de INSERT/UPDATE/DELETE para leads
DROP POLICY IF EXISTS "Hierarchical lead management" ON public.leads;

CREATE POLICY "Hierarchical lead management" ON public.leads
FOR ALL USING (
  organization_id = get_user_organization_id() 
  AND (
    -- Super admin ou admin da organização
    is_super_admin() OR is_admin()
    OR
    -- Usuário com permissão lead_edit_all
    user_has_permission('lead_edit_all', auth.uid())
    OR
    -- Lead atribuído ao próprio usuário
    assigned_user_id = auth.uid()
    OR
    -- NOVO: Líder de equipe pode gerenciar leads em pipelines vinculadas à sua equipe
    (
      is_team_leader(auth.uid()) AND
      pipeline_id IN (SELECT get_user_led_pipeline_ids())
    )
    OR
    -- Líder pode gerenciar leads de membros da sua equipe
    (
      is_team_leader(auth.uid()) AND
      assigned_user_id IN (
        SELECT tm.user_id 
        FROM team_members tm 
        WHERE tm.team_id IN (SELECT get_user_led_team_ids())
      )
    )
  )
);