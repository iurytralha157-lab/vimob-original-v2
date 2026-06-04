-- Super Admin RLS Policies
-- Allow super admin to view and manage all data across organizations

-- Organizations
CREATE POLICY "Super admin can view all organizations"
  ON public.organizations FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can insert organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can update organizations"
  ON public.organizations FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "Super admin can delete organizations"
  ON public.organizations FOR DELETE
  USING (public.is_super_admin());

-- Pipelines
CREATE POLICY "Super admin can view all pipelines"
  ON public.pipelines FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage pipelines"
  ON public.pipelines FOR ALL
  USING (public.is_super_admin());

-- Stages
CREATE POLICY "Super admin can view all stages"
  ON public.stages FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage stages"
  ON public.stages FOR ALL
  USING (public.is_super_admin());

-- Teams
CREATE POLICY "Super admin can view all teams"
  ON public.teams FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage teams"
  ON public.teams FOR ALL
  USING (public.is_super_admin());

-- Team members
CREATE POLICY "Super admin can view all team members"
  ON public.team_members FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage team members"
  ON public.team_members FOR ALL
  USING (public.is_super_admin());

-- Leads
CREATE POLICY "Super admin can view all leads"
  ON public.leads FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage leads"
  ON public.leads FOR ALL
  USING (public.is_super_admin());

-- Users
CREATE POLICY "Super admin can view all users"
  ON public.users FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage users"
  ON public.users FOR ALL
  USING (public.is_super_admin());

-- WhatsApp sessions
CREATE POLICY "Super admin can view all whatsapp sessions"
  ON public.whatsapp_sessions FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage whatsapp sessions"
  ON public.whatsapp_sessions FOR ALL
  USING (public.is_super_admin());

-- WhatsApp conversations
CREATE POLICY "Super admin can view all whatsapp conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage whatsapp conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (public.is_super_admin());

-- WhatsApp messages
CREATE POLICY "Super admin can view all whatsapp messages"
  ON public.whatsapp_messages FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage whatsapp messages"
  ON public.whatsapp_messages FOR ALL
  USING (public.is_super_admin());

-- Activities
CREATE POLICY "Super admin can view all activities"
  ON public.activities FOR SELECT
  USING (public.is_super_admin());

-- Notifications
CREATE POLICY "Super admin can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.is_super_admin());

-- Schedule events
CREATE POLICY "Super admin can view all schedule events"
  ON public.schedule_events FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage schedule events"
  ON public.schedule_events FOR ALL
  USING (public.is_super_admin());

-- Contracts
CREATE POLICY "Super admin can view all contracts"
  ON public.contracts FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage contracts"
  ON public.contracts FOR ALL
  USING (public.is_super_admin());

-- Properties
CREATE POLICY "Super admin can view all properties"
  ON public.properties FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage properties"
  ON public.properties FOR ALL
  USING (public.is_super_admin());

-- Tags
CREATE POLICY "Super admin can view all tags"
  ON public.tags FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage tags"
  ON public.tags FOR ALL
  USING (public.is_super_admin());

-- Automations
CREATE POLICY "Super admin can view all automations"
  ON public.automations FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can manage automations"
  ON public.automations FOR ALL
  USING (public.is_super_admin());