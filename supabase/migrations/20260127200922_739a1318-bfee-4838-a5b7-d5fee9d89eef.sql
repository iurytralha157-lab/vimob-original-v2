-- =====================================================
-- MIGRAÇÃO: Correção do Sistema de Gestão (Bolsão + Escala)
-- =====================================================

-- 1. Adicionar colunas faltantes na tabela leads (se não existirem)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'assigned_at') THEN
    ALTER TABLE public.leads ADD COLUMN assigned_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'first_touch_at') THEN
    ALTER TABLE public.leads ADD COLUMN first_touch_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'redistribution_count') THEN
    ALTER TABLE public.leads ADD COLUMN redistribution_count integer DEFAULT 0;
  END IF;
END $$;

-- 2. Criar tabela de histórico do bolsão (se não existir)
CREATE TABLE IF NOT EXISTS public.lead_pool_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text DEFAULT 'timeout',
  redistributed_at timestamptz DEFAULT now()
);

-- 3. Habilitar RLS na tabela de histórico
ALTER TABLE public.lead_pool_history ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para lead_pool_history (drop antes para evitar duplicação)
DROP POLICY IF EXISTS "Users can view their org pool history" ON public.lead_pool_history;
DROP POLICY IF EXISTS "Super admins can view all pool history" ON public.lead_pool_history;

CREATE POLICY "Users can view their org pool history"
  ON public.lead_pool_history FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Super admins can view all pool history"
  ON public.lead_pool_history FOR SELECT
  USING (public.is_super_admin());

-- 5. Trigger para preencher assigned_at automaticamente
CREATE OR REPLACE FUNCTION public.set_lead_assigned_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se está sendo atribuído (antes era NULL ou mudou de usuário)
  IF NEW.assigned_user_id IS NOT NULL 
     AND (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id != NEW.assigned_user_id) THEN
    NEW.assigned_at := NOW();
    -- Limpar first_touch_at para novo ciclo de redistribuição
    NEW.first_touch_at := NULL;
  END IF;
  
  -- Se foi removido o responsável, limpar assigned_at
  IF NEW.assigned_user_id IS NULL AND OLD.assigned_user_id IS NOT NULL THEN
    NEW.assigned_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_assigned_at ON public.leads;
CREATE TRIGGER tr_set_assigned_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_assigned_at();

-- Trigger para INSERT também (quando lead é criado já atribuído)
CREATE OR REPLACE FUNCTION public.set_lead_assigned_at_on_insert()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_user_id IS NOT NULL THEN
    NEW.assigned_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_assigned_at_insert ON public.leads;
CREATE TRIGGER tr_set_assigned_at_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_assigned_at_on_insert();

-- 6. DROP a função existente antes de recriar com tipo de retorno diferente
DROP FUNCTION IF EXISTS public.handle_lead_intake(uuid);

-- 7. Recriar handle_lead_intake com retorno JSONB e verificação de disponibilidade
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_member RECORD;
  v_assigned_user_id uuid;
  v_next_index int;
  v_member_count int;
  v_attempts int := 0;
  v_max_attempts int := 100;
  v_round_robin_id uuid;
BEGIN
  -- 1. Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Lead already assigned', 'assigned_user_id', v_lead.assigned_user_id);
  END IF;

  -- 2. Find active round-robin queue using rules or default
  v_round_robin_id := public.pick_round_robin_for_lead(p_lead_id);
  
  IF v_round_robin_id IS NULL THEN
    -- Fallback: find any active queue for the organization
    SELECT * INTO v_queue
    FROM round_robins
    WHERE organization_id = v_lead.organization_id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active round-robin queue');
    END IF;
    
    v_round_robin_id := v_queue.id;
  ELSE
    SELECT * INTO v_queue FROM round_robins WHERE id = v_round_robin_id;
  END IF;

  -- 3. Count members in this queue
  SELECT COUNT(*) INTO v_member_count
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin_id;

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No members in queue');
  END IF;

  -- 4. Loop through members to find an available one
  v_next_index := COALESCE(v_queue.last_assigned_index, 0);
  
  WHILE v_attempts < v_max_attempts AND v_attempts < v_member_count * 2 LOOP
    v_next_index := (v_next_index % v_member_count) + 1;
    v_attempts := v_attempts + 1;
    
    -- Get member at this position
    SELECT rrm.*, u.name as user_name INTO v_member
    FROM round_robin_members rrm
    JOIN users u ON u.id = rrm.user_id
    WHERE rrm.round_robin_id = v_round_robin_id
    ORDER BY rrm.position ASC
    OFFSET (v_next_index - 1)
    LIMIT 1;
    
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    
    -- *** NOVA VERIFICAÇÃO: Checar disponibilidade do membro ***
    IF NOT public.is_member_available(v_member.user_id) THEN
      -- Membro fora do horário de trabalho, pular para próximo
      CONTINUE;
    END IF;
    
    -- Membro disponível! Atribuir o lead
    v_assigned_user_id := v_member.user_id;
    EXIT;
  END LOOP;
  
  IF v_assigned_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available members at this time');
  END IF;

  -- 5. Update lead with assigned user
  UPDATE leads 
  SET assigned_user_id = v_assigned_user_id,
      assigned_at = NOW()
  WHERE id = p_lead_id;
  
  -- 6. Update queue's last assigned index
  UPDATE round_robins
  SET last_assigned_index = v_next_index
  WHERE id = v_round_robin_id;
  
  -- 7. Log assignment
  INSERT INTO assignments_log (lead_id, assigned_user_id, round_robin_id, organization_id, reason)
  VALUES (p_lead_id, v_assigned_user_id, v_round_robin_id, v_lead.organization_id, 'round_robin');

  RETURN jsonb_build_object(
    'success', true, 
    'assigned_user_id', v_assigned_user_id,
    'round_robin_id', v_round_robin_id,
    'attempts', v_attempts
  );
END;
$$;

-- 8. Recriar o trigger que usa handle_lead_intake (ele chamava a versão void)
CREATE OR REPLACE FUNCTION public.trigger_handle_lead_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN 
  -- Só aciona se o lead não tiver responsável atribuído
  IF NEW.assigned_user_id IS NULL THEN 
    v_result := public.handle_lead_intake(NEW.id); 
  END IF; 
  RETURN NEW; 
END; 
$$;

-- 9. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_assigned_at ON public.leads(assigned_at);
CREATE INDEX IF NOT EXISTS idx_leads_first_touch_at ON public.leads(first_touch_at);
CREATE INDEX IF NOT EXISTS idx_lead_pool_history_lead_id ON public.lead_pool_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_pool_history_org_id ON public.lead_pool_history(organization_id);