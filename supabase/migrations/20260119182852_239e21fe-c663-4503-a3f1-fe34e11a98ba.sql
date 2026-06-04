-- =====================================================
-- MIGRAÇÃO COMPLETA: Adicionar colunas e tabelas faltantes
-- =====================================================

-- 1. Adicionar colunas faltantes na tabela stage_automations
-- (Usamos action_config como JSON, então adicionamos campos individuais para compatibilidade)
ALTER TABLE public.stage_automations 
ADD COLUMN IF NOT EXISTS automation_type text,
ADD COLUMN IF NOT EXISTS trigger_days integer,
ADD COLUMN IF NOT EXISTS target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS whatsapp_template text,
ADD COLUMN IF NOT EXISTS alert_message text;

-- 2. Adicionar colunas faltantes na tabela cadence_tasks_template
ALTER TABLE public.cadence_tasks_template 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'call',
ADD COLUMN IF NOT EXISTS observation text,
ADD COLUMN IF NOT EXISTS recommended_message text;

-- 3. Adicionar colunas faltantes na tabela lead_tasks
ALTER TABLE public.lead_tasks 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'call';

-- 4. Adicionar colunas faltantes na tabela round_robins
ALTER TABLE public.round_robins 
ADD COLUMN IF NOT EXISTS strategy text DEFAULT 'simple',
ADD COLUMN IF NOT EXISTS leads_distributed integer DEFAULT 0;

-- 5. Adicionar coluna role na tabela invitations
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 6. Adicionar coluna display_name na tabela whatsapp_sessions
ALTER TABLE public.whatsapp_sessions 
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS last_connected_at timestamp with time zone;

-- 7. Adicionar coluna created_by na tabela automations
ALTER TABLE public.automations 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 8. Criar tabela automation_connections (para conexões entre nós)
CREATE TABLE IF NOT EXISTS public.automation_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  source_node_id uuid REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  target_node_id uuid REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  source_handle text,
  condition_branch text DEFAULT 'default',
  created_at timestamp with time zone DEFAULT now()
);

-- 9. Criar tabela automation_templates (templates de mensagens)
CREATE TABLE IF NOT EXISTS public.automation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 10. Criar tabela automation_executions (execuções de automação)
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id uuid,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  current_node_id uuid REFERENCES public.automation_nodes(id) ON DELETE SET NULL,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  error_message text,
  execution_data jsonb DEFAULT '{}'::jsonb,
  next_execution_at timestamp with time zone
);

-- 11. Adicionar action_type na tabela automation_nodes se não existir
ALTER TABLE public.automation_nodes 
ADD COLUMN IF NOT EXISTS action_type text;

-- 12. Criar função handle_lead_intake se não existir
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_round_robin round_robins%ROWTYPE;
  v_member round_robin_members%ROWTYPE;
  v_assigned_user_id uuid;
  v_result jsonb;
BEGIN
  -- Buscar o lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  -- Se já tem usuário atribuído, retornar
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'lead_id', v_lead.id,
      'pipeline_id', v_lead.pipeline_id,
      'stage_id', v_lead.stage_id,
      'assigned_user_id', v_lead.assigned_user_id,
      'round_robin_used', false
    );
  END IF;
  
  -- Buscar round robin ativo da organização
  SELECT rr.* INTO v_round_robin 
  FROM round_robins rr
  WHERE rr.organization_id = v_lead.organization_id
    AND rr.is_active = true
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'lead_id', v_lead.id,
      'pipeline_id', v_lead.pipeline_id,
      'stage_id', v_lead.stage_id,
      'assigned_user_id', null,
      'round_robin_used', false
    );
  END IF;
  
  -- Buscar próximo membro do round robin
  SELECT * INTO v_member
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin.id
  ORDER BY position
  OFFSET v_round_robin.last_assigned_index
  LIMIT 1;
  
  -- Se não encontrou, reinicia do início
  IF NOT FOUND THEN
    SELECT * INTO v_member
    FROM round_robin_members
    WHERE round_robin_id = v_round_robin.id
    ORDER BY position
    LIMIT 1;
  END IF;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'lead_id', v_lead.id,
      'pipeline_id', v_lead.pipeline_id,
      'stage_id', v_lead.stage_id,
      'assigned_user_id', null,
      'round_robin_used', false,
      'error', 'No members in round robin'
    );
  END IF;
  
  v_assigned_user_id := v_member.user_id;
  
  -- Atribuir lead ao usuário
  UPDATE leads SET assigned_user_id = v_assigned_user_id WHERE id = p_lead_id;
  
  -- Atualizar índice do round robin
  UPDATE round_robins 
  SET last_assigned_index = (
    SELECT COALESCE(
      (SELECT position + 1 FROM round_robin_members WHERE id = v_member.id),
      0
    )
  )
  WHERE id = v_round_robin.id;
  
  -- Registrar no log
  INSERT INTO assignments_log (lead_id, assigned_user_id, round_robin_id)
  VALUES (p_lead_id, v_assigned_user_id, v_round_robin.id);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead.id,
    'pipeline_id', v_lead.pipeline_id,
    'stage_id', v_lead.stage_id,
    'assigned_user_id', v_assigned_user_id,
    'round_robin_used', true
  );
END;
$$;

-- 13. Habilitar RLS nas novas tabelas
ALTER TABLE public.automation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- 14. Políticas RLS para automation_connections
CREATE POLICY "Users can view automation connections" ON public.automation_connections
FOR SELECT USING (
  automation_id IN (
    SELECT id FROM automations WHERE organization_id = get_user_organization_id()
  )
);

CREATE POLICY "Admins can manage automation connections" ON public.automation_connections
FOR ALL USING (
  automation_id IN (
    SELECT id FROM automations WHERE organization_id = get_user_organization_id()
  ) AND is_admin()
);

-- 15. Políticas RLS para automation_templates
CREATE POLICY "Users can view automation templates" ON public.automation_templates
FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage automation templates" ON public.automation_templates
FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- 16. Políticas RLS para automation_executions
CREATE POLICY "Users can view automation executions" ON public.automation_executions
FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "System can manage automation executions" ON public.automation_executions
FOR ALL USING (organization_id = get_user_organization_id());