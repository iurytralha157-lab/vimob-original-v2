
-- Atualizar política RLS da tabela leads para incluir permissões RBAC customizadas
-- Isso vai permitir que usuários com lead_view_all vejam todos os leads

-- Remover políticas antigas
DROP POLICY IF EXISTS "Hierarchical lead access" ON leads;
DROP POLICY IF EXISTS "Hierarchical lead management" ON leads;

-- Criar nova política de SELECT que respeita lead_view_all e lead_view_team
CREATE POLICY "Hierarchical lead access"
ON leads FOR SELECT
USING (
  organization_id = get_user_organization_id() AND (
    -- Admin vê tudo
    is_admin()
    -- Usuário com permissão lead_view_all vê tudo
    OR public.user_has_permission('lead_view_all', auth.uid())
    -- Usuário com permissão lead_view_team vê leads do time
    OR (
      public.user_has_permission('lead_view_team', auth.uid())
      AND (
        assigned_user_id IN (
          SELECT tm.user_id 
          FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
          WHERE tm.team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
          )
        )
        OR assigned_user_id IS NULL
      )
    )
    -- Líder de time vê leads do pipeline do time
    OR (
      public.is_team_leader(auth.uid()) AND pipeline_id IN (
        SELECT tp.pipeline_id
        FROM team_pipelines tp
        WHERE tp.team_id IN (SELECT get_user_led_team_ids())
      )
    )
    -- Usuário vê próprios leads
    OR assigned_user_id = auth.uid()
    -- Leads não vinculados a pipelines de time
    OR NOT EXISTS (
      SELECT 1 FROM team_pipelines WHERE pipeline_id = leads.pipeline_id
    )
  )
);

-- Criar nova política de INSERT/UPDATE/DELETE que respeita lead_edit_all
CREATE POLICY "Hierarchical lead management"
ON leads FOR ALL
USING (
  organization_id = get_user_organization_id() AND (
    -- Admin edita tudo
    is_admin()
    -- Usuário com permissão lead_edit_all edita tudo
    OR public.user_has_permission('lead_edit_all', auth.uid())
    -- Líder de time edita leads do pipeline do time
    OR (
      public.is_team_leader(auth.uid()) AND pipeline_id IN (
        SELECT tp.pipeline_id
        FROM team_pipelines tp
        WHERE tp.team_id IN (SELECT get_user_led_team_ids())
      )
    )
    -- Usuário edita próprios leads
    OR assigned_user_id = auth.uid()
    -- Leads não vinculados a pipelines de time
    OR NOT EXISTS (
      SELECT 1 FROM team_pipelines WHERE pipeline_id = leads.pipeline_id
    )
  )
);
