-- =============================================================
-- COMPREHENSIVE RLS POLICY UPDATE FOR SUPER ADMIN DATA ISOLATION
-- Only for tables with direct organization_id column
-- =============================================================

-- =====================
-- PIPELINES
-- =====================
DROP POLICY IF EXISTS "Super admin can view all pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Super admin can manage pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Super admin access pipelines" ON public.pipelines;

CREATE POLICY "Super admin access pipelines" ON public.pipelines
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- TEAMS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all teams" ON public.teams;
DROP POLICY IF EXISTS "Super admin can manage teams" ON public.teams;
DROP POLICY IF EXISTS "Super admin access teams" ON public.teams;

CREATE POLICY "Super admin access teams" ON public.teams
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- LEADS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Super admin can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Super admin access leads" ON public.leads;

CREATE POLICY "Super admin access leads" ON public.leads
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- USERS (special: always can see self)
-- =====================
DROP POLICY IF EXISTS "Super admin can view all users" ON public.users;
DROP POLICY IF EXISTS "Super admin can manage users" ON public.users;
DROP POLICY IF EXISTS "Super admin access users" ON public.users;

CREATE POLICY "Super admin access users" ON public.users
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
    OR id = auth.uid()
  )
);

-- =====================
-- NOTIFICATIONS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Super admin access notifications" ON public.notifications;

CREATE POLICY "Super admin access notifications" ON public.notifications
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- CONTRACTS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all contracts" ON public.contracts;
DROP POLICY IF EXISTS "Super admin can manage contracts" ON public.contracts;
DROP POLICY IF EXISTS "Super admin access contracts" ON public.contracts;

CREATE POLICY "Super admin access contracts" ON public.contracts
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- PROPERTIES
-- =====================
DROP POLICY IF EXISTS "Super admin can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Super admin can manage properties" ON public.properties;
DROP POLICY IF EXISTS "Super admin access properties" ON public.properties;

CREATE POLICY "Super admin access properties" ON public.properties
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- TAGS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all tags" ON public.tags;
DROP POLICY IF EXISTS "Super admin can manage tags" ON public.tags;
DROP POLICY IF EXISTS "Super admin access tags" ON public.tags;

CREATE POLICY "Super admin access tags" ON public.tags
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- AUTOMATIONS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all automations" ON public.automations;
DROP POLICY IF EXISTS "Super admin can manage automations" ON public.automations;
DROP POLICY IF EXISTS "Super admin access automations" ON public.automations;

CREATE POLICY "Super admin access automations" ON public.automations
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- AUTOMATION EXECUTIONS
-- =====================
DROP POLICY IF EXISTS "Super admin access automation_executions" ON public.automation_executions;

CREATE POLICY "Super admin access automation_executions" ON public.automation_executions
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- ORGANIZATION MODULES
-- =====================
DROP POLICY IF EXISTS "Super admin can view all organization_modules" ON public.organization_modules;
DROP POLICY IF EXISTS "Super admin can manage organization_modules" ON public.organization_modules;
DROP POLICY IF EXISTS "Super admin access organization_modules" ON public.organization_modules;

CREATE POLICY "Super admin access organization_modules" ON public.organization_modules
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- WHATSAPP SESSIONS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all whatsapp_sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Super admin can manage whatsapp_sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Super admin access whatsapp_sessions" ON public.whatsapp_sessions;

CREATE POLICY "Super admin access whatsapp_sessions" ON public.whatsapp_sessions
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- SCHEDULE EVENTS
-- =====================
DROP POLICY IF EXISTS "Super admin can view all schedule_events" ON public.schedule_events;
DROP POLICY IF EXISTS "Super admin can manage schedule_events" ON public.schedule_events;
DROP POLICY IF EXISTS "Super admin access schedule_events" ON public.schedule_events;

CREATE POLICY "Super admin access schedule_events" ON public.schedule_events
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- FINANCIAL ENTRIES
-- =====================
DROP POLICY IF EXISTS "Super admin access financial_entries" ON public.financial_entries;

CREATE POLICY "Super admin access financial_entries" ON public.financial_entries
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- FINANCIAL CATEGORIES
-- =====================
DROP POLICY IF EXISTS "Super admin access financial_categories" ON public.financial_categories;

CREATE POLICY "Super admin access financial_categories" ON public.financial_categories
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- COMMISSIONS
-- =====================
DROP POLICY IF EXISTS "Super admin access commissions" ON public.commissions;

CREATE POLICY "Super admin access commissions" ON public.commissions
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- INVITATIONS
-- =====================
DROP POLICY IF EXISTS "Super admin access invitations" ON public.invitations;

CREATE POLICY "Super admin access invitations" ON public.invitations
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- META INTEGRATIONS
-- =====================
DROP POLICY IF EXISTS "Super admin access meta_integrations" ON public.meta_integrations;

CREATE POLICY "Super admin access meta_integrations" ON public.meta_integrations
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- CADENCE TEMPLATES
-- =====================
DROP POLICY IF EXISTS "Super admin access cadence_templates" ON public.cadence_templates;

CREATE POLICY "Super admin access cadence_templates" ON public.cadence_templates
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- ROUND ROBINS
-- =====================
DROP POLICY IF EXISTS "Super admin access round_robins" ON public.round_robins;

CREATE POLICY "Super admin access round_robins" ON public.round_robins
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);

-- =====================
-- LEAD TIMELINE EVENTS
-- =====================
DROP POLICY IF EXISTS "Super admin access lead_timeline_events" ON public.lead_timeline_events;

CREATE POLICY "Super admin access lead_timeline_events" ON public.lead_timeline_events
FOR ALL USING (
  is_super_admin() AND (
    get_user_organization_id() IS NULL
    OR organization_id = get_user_organization_id()
  )
);