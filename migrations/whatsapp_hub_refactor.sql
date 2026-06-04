-- =====================================================================
-- WhatsApp HUB Refactor: identification, distribution & visibility control
-- Execute manually in Supabase SQL Editor (in order). SQL 1 → SQL 6.
-- SQL 7 (drop only_leads_access) só rode após validar tudo em produção.
-- =====================================================================

-- SQL 1 — Meta/UTM tracking on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_click_id text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS initial_message text;

CREATE INDEX IF NOT EXISTS idx_leads_meta_campaign ON public.leads(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_meta_click ON public.leads(meta_click_id);

-- SQL 2 — Inbound identification rules
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  match_type text NOT NULL CHECK (match_type IN ('contains','equals','regex','utm','meta_ctwa','any')),
  match_value text,
  match_field text DEFAULT 'message',
  target_round_robin_id uuid REFERENCES public.round_robins(id) ON DELETE SET NULL,
  target_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  target_user_id uuid,
  target_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  source_label text,
  campaign_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_rules_org_active
  ON public.whatsapp_inbound_rules(organization_id, is_active, priority);

ALTER TABLE public.whatsapp_inbound_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_rules_select ON public.whatsapp_inbound_rules;
CREATE POLICY inbound_rules_select ON public.whatsapp_inbound_rules
  FOR SELECT USING (organization_id = get_user_organization_id() OR is_super_admin());

DROP POLICY IF EXISTS inbound_rules_manage ON public.whatsapp_inbound_rules;
CREATE POLICY inbound_rules_manage ON public.whatsapp_inbound_rules
  FOR ALL USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin())
  WITH CHECK ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- SQL 3 — Inbound logs (audit trail)
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  session_id uuid,
  conversation_id uuid,
  lead_id uuid,
  matched_rule_id uuid,
  match_details jsonb,
  assigned_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_logs_org ON public.whatsapp_inbound_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_logs_lead ON public.whatsapp_inbound_logs(lead_id);

ALTER TABLE public.whatsapp_inbound_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbound_logs_select ON public.whatsapp_inbound_logs;
CREATE POLICY inbound_logs_select ON public.whatsapp_inbound_logs
  FOR SELECT USING (organization_id = get_user_organization_id() OR is_super_admin());

-- SQL 4 — Access mode enum (replaces only_leads_access boolean)
ALTER TABLE public.whatsapp_session_access
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'assigned_leads_only'
    CHECK (access_mode IN ('assigned_leads_only','team_leads','all_leads','full_inbox'));

UPDATE public.whatsapp_session_access
   SET access_mode = CASE WHEN only_leads_access THEN 'assigned_leads_only' ELSE 'full_inbox' END
 WHERE access_mode = 'assigned_leads_only';

-- SQL 5 — Conversation visibility helper
CREATE OR REPLACE FUNCTION public.can_view_whatsapp_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM whatsapp_conversations c
    JOIN whatsapp_sessions s ON s.id = c.session_id
    LEFT JOIN whatsapp_session_access wsa
      ON wsa.session_id = c.session_id AND wsa.user_id = auth.uid()
    WHERE c.id = _conv_id
      AND (
        is_super_admin()
        OR s.owner_user_id = auth.uid()
        OR (
          wsa.user_id IS NOT NULL AND COALESCE(wsa.can_view, true) AND (
            wsa.access_mode = 'full_inbox'
            OR (wsa.access_mode = 'all_leads' AND c.lead_id IS NOT NULL)
            OR (wsa.access_mode = 'team_leads' AND c.lead_id IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM leads l
                  JOIN team_members tm_self ON tm_self.user_id = auth.uid()
                  JOIN team_members tm_lead ON tm_lead.team_id = tm_self.team_id
                                            AND tm_lead.user_id = l.assigned_user_id
                  WHERE l.id = c.lead_id
                ))
            OR (wsa.access_mode = 'assigned_leads_only' AND c.lead_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM leads l
                  WHERE l.id = c.lead_id AND l.assigned_user_id = auth.uid()
                ))
          )
        )
      )
  );
$$;

-- SQL 6 — Consolidate SELECT policies (remove old overlapping ones)
DROP POLICY IF EXISTS conversations_select ON public.whatsapp_conversations;
DROP POLICY IF EXISTS conversations_privacy_policy ON public.whatsapp_conversations;
CREATE POLICY conversations_select ON public.whatsapp_conversations
  FOR SELECT USING (public.can_view_whatsapp_conversation(id));

DROP POLICY IF EXISTS messages_select ON public.whatsapp_messages;
CREATE POLICY messages_select ON public.whatsapp_messages
  FOR SELECT USING (public.can_view_whatsapp_conversation(conversation_id));

DROP POLICY IF EXISTS conversations_update ON public.whatsapp_conversations;
CREATE POLICY conversations_update ON public.whatsapp_conversations
  FOR UPDATE USING (public.can_view_whatsapp_conversation(id));

DROP POLICY IF EXISTS messages_update ON public.whatsapp_messages;
CREATE POLICY messages_update ON public.whatsapp_messages
  FOR UPDATE USING (public.can_view_whatsapp_conversation(conversation_id));

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_conv_lead ON public.whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wsa_user ON public.whatsapp_session_access(user_id);

-- =====================================================================
-- SQL 7 (OPCIONAL — rode SOMENTE após 1 semana de validação em produção)
-- =====================================================================
-- ALTER TABLE public.whatsapp_session_access DROP COLUMN IF EXISTS only_leads_access;
