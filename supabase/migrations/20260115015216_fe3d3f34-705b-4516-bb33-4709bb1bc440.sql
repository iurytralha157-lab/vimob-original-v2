-- Add remaining Super Admin RLS policies (skip teams which already exists)

-- Team Members
DROP POLICY IF EXISTS "Super admin can manage all team members" ON public.team_members;
CREATE POLICY "Super admin can manage all team members"
  ON public.team_members FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Team Pipelines
DROP POLICY IF EXISTS "Super admin can manage all team pipelines" ON public.team_pipelines;
CREATE POLICY "Super admin can manage all team pipelines"
  ON public.team_pipelines FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Round Robins
DROP POLICY IF EXISTS "Super admin can manage all round robins" ON public.round_robins;
CREATE POLICY "Super admin can manage all round robins"
  ON public.round_robins FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Round Robin Members
DROP POLICY IF EXISTS "Super admin can manage all round robin members" ON public.round_robin_members;
CREATE POLICY "Super admin can manage all round robin members"
  ON public.round_robin_members FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Round Robin Rules
DROP POLICY IF EXISTS "Super admin can manage all round robin rules" ON public.round_robin_rules;
CREATE POLICY "Super admin can manage all round robin rules"
  ON public.round_robin_rules FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Property Features
DROP POLICY IF EXISTS "Super admin can manage all property features" ON public.property_features;
CREATE POLICY "Super admin can manage all property features"
  ON public.property_features FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Property Proximities
DROP POLICY IF EXISTS "Super admin can manage all property proximities" ON public.property_proximities;
CREATE POLICY "Super admin can manage all property proximities"
  ON public.property_proximities FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Property Types
DROP POLICY IF EXISTS "Super admin can manage all property types" ON public.property_types;
CREATE POLICY "Super admin can manage all property types"
  ON public.property_types FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Property Sequences
DROP POLICY IF EXISTS "Super admin can manage all property sequences" ON public.property_sequences;
CREATE POLICY "Super admin can manage all property sequences"
  ON public.property_sequences FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Contract Sequences
DROP POLICY IF EXISTS "Super admin can manage all contract sequences" ON public.contract_sequences;
CREATE POLICY "Super admin can manage all contract sequences"
  ON public.contract_sequences FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Users
DROP POLICY IF EXISTS "Super admin can manage all users" ON public.users;
CREATE POLICY "Super admin can manage all users"
  ON public.users FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Invitations
DROP POLICY IF EXISTS "Super admin can manage all invitations" ON public.invitations;
CREATE POLICY "Super admin can manage all invitations"
  ON public.invitations FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Notifications
DROP POLICY IF EXISTS "Super admin can manage all notifications" ON public.notifications;
CREATE POLICY "Super admin can manage all notifications"
  ON public.notifications FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Activities
DROP POLICY IF EXISTS "Super admin can manage all activities" ON public.activities;
CREATE POLICY "Super admin can manage all activities"
  ON public.activities FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Assignments Log
DROP POLICY IF EXISTS "Super admin can manage all assignments log" ON public.assignments_log;
CREATE POLICY "Super admin can manage all assignments log"
  ON public.assignments_log FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Stages
DROP POLICY IF EXISTS "Super admin can manage all stages" ON public.stages;
CREATE POLICY "Super admin can manage all stages"
  ON public.stages FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Stage Automations
DROP POLICY IF EXISTS "Super admin can manage all stage automations" ON public.stage_automations;
CREATE POLICY "Super admin can manage all stage automations"
  ON public.stage_automations FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Google Calendar Tokens
DROP POLICY IF EXISTS "Super admin can manage all google calendar tokens" ON public.google_calendar_tokens;
CREATE POLICY "Super admin can manage all google calendar tokens"
  ON public.google_calendar_tokens FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Automation Templates
DROP POLICY IF EXISTS "Super admin can manage all automation templates" ON public.automation_templates;
CREATE POLICY "Super admin can manage all automation templates"
  ON public.automation_templates FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());