-- CORREÇÃO DEFINITIVA: Ordem correta - primeiro dropar políticas, depois funções

-- 1. PRIMEIRO: Remover políticas que dependem das funções
DROP POLICY IF EXISTS "Hierarchical lead access" ON leads;
DROP POLICY IF EXISTS "Hierarchical lead management" ON leads;

-- 2. Agora podemos remover as funções
DROP FUNCTION IF EXISTS public.is_team_leader(uuid);
DROP FUNCTION IF EXISTS public.is_team_leader();
DROP FUNCTION IF EXISTS public.get_user_led_team_ids();

-- 3. Recriar a função is_team_leader correta usando team_members.is_leader
CREATE OR REPLACE FUNCTION public.is_team_leader(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = check_user_id AND is_leader = true
  )
$$;

-- 4. Recriar função get_user_led_team_ids
CREATE OR REPLACE FUNCTION public.get_user_led_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND is_leader = true
$$;

-- 5. Criar política de SELECT simplificada e robusta
CREATE POLICY "Hierarchical lead access"
ON leads FOR SELECT
USING (
  organization_id = get_user_organization_id() AND (
    -- Super admin vê tudo
    public.is_super_admin()
    -- Admin da organização vê tudo
    OR public.is_admin()
    -- Usuário com permissão RBAC lead_view_all vê tudo
    OR public.user_has_permission('lead_view_all', auth.uid())
    -- Usuário vê leads atribuídos a ele
    OR assigned_user_id = auth.uid()
    -- Líder de time vê leads do time
    OR (
      public.is_team_leader(auth.uid()) AND (
        assigned_user_id IN (
          SELECT tm.user_id 
          FROM team_members tm
          WHERE tm.team_id IN (SELECT public.get_user_led_team_ids())
        )
      )
    )
    -- Usuário com lead_view_team vê leads do time
    OR (
      public.user_has_permission('lead_view_team', auth.uid())
      AND assigned_user_id IN (
        SELECT tm2.user_id 
        FROM team_members tm2
        WHERE tm2.team_id IN (
          SELECT tm3.team_id FROM team_members tm3 WHERE tm3.user_id = auth.uid()
        )
      )
    )
  )
);

-- 6. Criar política de ALL (INSERT/UPDATE/DELETE) simplificada
CREATE POLICY "Hierarchical lead management"
ON leads FOR ALL
USING (
  organization_id = get_user_organization_id() AND (
    -- Super admin edita tudo
    public.is_super_admin()
    -- Admin da organização edita tudo
    OR public.is_admin()
    -- Usuário com permissão RBAC lead_edit_all edita tudo
    OR public.user_has_permission('lead_edit_all', auth.uid())
    -- Usuário edita leads atribuídos a ele
    OR assigned_user_id = auth.uid()
    -- Líder de time edita leads do time
    OR (
      public.is_team_leader(auth.uid()) AND (
        assigned_user_id IN (
          SELECT tm.user_id 
          FROM team_members tm
          WHERE tm.team_id IN (SELECT public.get_user_led_team_ids())
        )
      )
    )
  )
);