-- =====================================================
-- PERFORMANCE OPTIMIZATION: Índices e Funções
-- =====================================================

-- 1. ÍNDICES PARA TABELA LEADS (mais acessada)
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user_id ON leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id ON leads(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at_desc ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_pipeline ON leads(organization_id, pipeline_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON leads(organization_id, stage_id);

-- 2. ÍNDICES PARA TABELA ACTIVITIES
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at_desc ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);

-- 3. ÍNDICES PARA TABELA STAGES
CREATE INDEX IF NOT EXISTS idx_stages_pipeline_id ON stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_stages_pipeline_position ON stages(pipeline_id, position);

-- 4. ÍNDICES PARA TABELA PROPERTIES
CREATE INDEX IF NOT EXISTS idx_properties_organization_id ON properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_created_at_desc ON properties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_tipo_negocio ON properties(tipo_de_negocio);

-- 5. ÍNDICES PARA TABELA PIPELINES
CREATE INDEX IF NOT EXISTS idx_pipelines_organization_id ON pipelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_org_default ON pipelines(organization_id, is_default);

-- 6. ÍNDICE PARA LEAD_TAGS
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag_id ON lead_tags(tag_id);

-- 7. ÍNDICES PARA NOTIFICATIONS
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc ON notifications(created_at DESC);

-- 8. ÍNDICES PARA WHATSAPP (usando sent_at para messages)
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_session ON whatsapp_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_updated ON whatsapp_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at ON whatsapp_messages(sent_at DESC);

-- =====================================================
-- FUNÇÃO RPC PARA DASHBOARD STATS (evita múltiplas queries)
-- =====================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  result json;
  org_id uuid := get_user_organization_id();
  thirty_days_ago timestamptz := now() - interval '30 days';
  sixty_days_ago timestamptz := now() - interval '60 days';
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF org_id IS NULL THEN
    RETURN json_build_object('error', 'No organization');
  END IF;

  WITH stage_keys AS (
    SELECT id, stage_key FROM stages
  ),
  recent_leads AS (
    SELECT l.id, l.created_at, l.stage_id, sk.stage_key
    FROM leads l
    LEFT JOIN stage_keys sk ON l.stage_id = sk.id
    WHERE l.organization_id = org_id
  ),
  stats AS (
    SELECT
      COUNT(*) FILTER (WHERE created_at >= thirty_days_ago) as total_leads,
      COUNT(*) FILTER (WHERE created_at >= sixty_days_ago AND created_at < thirty_days_ago) as previous_period_leads,
      COUNT(*) FILTER (WHERE stage_key IN ('contacted', 'active', 'meeting', 'negotiation')) as in_progress,
      COUNT(*) FILTER (WHERE stage_key = 'closed' AND created_at >= month_start) as closed,
      COUNT(*) FILTER (WHERE stage_key = 'lost' AND created_at >= month_start) as lost
    FROM recent_leads
  )
  SELECT json_build_object(
    'totalLeads', COALESCE(total_leads, 0),
    'leadsInProgress', COALESCE(in_progress, 0),
    'leadsClosed', COALESCE(closed, 0),
    'leadsLost', COALESCE(lost, 0),
    'leadsTrend', CASE 
      WHEN previous_period_leads > 0 
      THEN ROUND(((total_leads - previous_period_leads)::numeric / previous_period_leads) * 100)
      ELSE 0 
    END,
    'closedTrend', 0
  ) INTO result
  FROM stats;
  
  RETURN result;
END;
$$;

-- =====================================================
-- FUNÇÃO RPC PARA FUNNEL DATA
-- =====================================================
CREATE OR REPLACE FUNCTION get_funnel_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  result json;
  org_id uuid := get_user_organization_id();
BEGIN
  IF org_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  WITH stage_counts AS (
    SELECT 
      s.id,
      s.name,
      s.stage_key,
      s.position,
      COUNT(l.id) as value
    FROM stages s
    LEFT JOIN leads l ON l.stage_id = s.id AND l.organization_id = org_id
    INNER JOIN pipelines p ON s.pipeline_id = p.id AND p.organization_id = org_id
    WHERE s.stage_key != 'lost'
    GROUP BY s.id, s.name, s.stage_key, s.position
    ORDER BY s.position
  ),
  total AS (
    SELECT SUM(value) as total_value FROM stage_counts
  )
  SELECT json_agg(
    json_build_object(
      'name', CASE 
        WHEN stage_key = 'new' THEN 'Novos Leads'
        WHEN stage_key IN ('contacted', 'active') THEN 'Conversa Ativa'
        WHEN stage_key = 'meeting' THEN 'Reunião Marcada'
        WHEN stage_key = 'negotiation' THEN 'Proposta/Negociação'
        WHEN stage_key = 'closed' THEN 'Fechados'
        ELSE name
      END,
      'value', value,
      'stage_key', stage_key,
      'percentage', CASE WHEN t.total_value > 0 THEN ROUND((value::numeric / t.total_value) * 100) ELSE 0 END
    )
  ) INTO result
  FROM stage_counts sc
  CROSS JOIN total t;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- =====================================================
-- FUNÇÃO RPC PARA LEAD SOURCES
-- =====================================================
CREATE OR REPLACE FUNCTION get_lead_sources_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  result json;
  org_id uuid := get_user_organization_id();
BEGIN
  IF org_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT json_agg(
    json_build_object(
      'name', CASE 
        WHEN source = 'meta' THEN 'Meta Ads'
        WHEN source = 'site' THEN 'Site'
        WHEN source = 'wordpress' THEN 'WordPress'
        WHEN source = 'manual' THEN 'Manual'
        ELSE source::text
      END,
      'value', count
    )
  ) INTO result
  FROM (
    SELECT source, COUNT(*) as count
    FROM leads
    WHERE organization_id = org_id
    GROUP BY source
    HAVING COUNT(*) > 0
    ORDER BY count DESC
  ) src;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;