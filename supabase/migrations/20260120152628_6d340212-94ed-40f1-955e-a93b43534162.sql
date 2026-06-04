-- =============================================================
-- RLS POLICIES FOR TABLES WITH INDIRECT ORGANIZATION REFERENCE
-- =============================================================

-- =====================
-- STAGES (via pipelines)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all stages" ON public.stages;
DROP POLICY IF EXISTS "Super admin can manage stages" ON public.stages;
DROP POLICY IF EXISTS "Super admin access stages" ON public.stages;

CREATE POLICY "Super admin access stages" ON public.stages
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR pipeline_id IN (
      SELECT id FROM public.pipelines WHERE organization_id = get_user_organization_id()
    )
  )
);

-- =====================
-- TEAM MEMBERS (via teams)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all team_members" ON public.team_members;
DROP POLICY IF EXISTS "Super admin can manage team_members" ON public.team_members;
DROP POLICY IF EXISTS "Super admin access team_members" ON public.team_members;

CREATE POLICY "Super admin access team_members" ON public.team_members
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR team_id IN (
      SELECT id FROM public.teams WHERE organization_id = get_user_organization_id()
    )
  )
);

-- =====================
-- ACTIVITIES (via leads)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all activities" ON public.activities;
DROP POLICY IF EXISTS "Super admin can manage activities" ON public.activities;
DROP POLICY IF EXISTS "Super admin access activities" ON public.activities;

CREATE POLICY "Super admin access activities" ON public.activities
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR lead_id IN (
      SELECT id FROM public.leads WHERE organization_id = get_user_organization_id()
    )
  )
);

-- =====================
-- AUTOMATION NODES (via automations)
-- =====================
DROP POLICY IF EXISTS "Super admin access automation_nodes" ON public.automation_nodes;

CREATE POLICY "Super admin access automation_nodes" ON public.automation_nodes
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR automation_id IN (
      SELECT id FROM public.automations WHERE organization_id = get_user_organization_id()
    )
  )
);

-- =====================
-- WHATSAPP CONVERSATIONS (via session)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin can manage whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin access whatsapp_conversations" ON public.whatsapp_conversations;

CREATE POLICY "Super admin access whatsapp_conversations" ON public.whatsapp_conversations
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR session_id IN (
      SELECT id FROM public.whatsapp_sessions WHERE organization_id = get_user_organization_id()
    )
  )
);

-- =====================
-- WHATSAPP MESSAGES (via conversations -> sessions)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin can manage whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin access whatsapp_messages" ON public.whatsapp_messages;

CREATE POLICY "Super admin access whatsapp_messages" ON public.whatsapp_messages
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR conversation_id IN (
      SELECT c.id FROM public.whatsapp_conversations c
      JOIN public.whatsapp_sessions s ON c.session_id = s.id
      WHERE s.organization_id = get_user_organization_id()
    )
  )
);