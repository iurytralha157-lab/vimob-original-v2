-- PARTE 1: Corrigir leads existentes sem pipeline/stage
-- Atribuir pipeline e stage padrão para todos os leads órfãos de cada organização
UPDATE leads l
SET 
  pipeline_id = sub.pipeline_id,
  stage_id = sub.stage_id,
  stage_entered_at = COALESCE(l.stage_entered_at, l.created_at)
FROM (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id as pipeline_id,
    s.id as stage_id
  FROM pipelines p
  JOIN stages s ON s.pipeline_id = p.id
  WHERE p.is_default = true
  ORDER BY p.organization_id, s.position ASC
) sub
WHERE l.pipeline_id IS NULL
  AND l.organization_id = sub.organization_id;

-- PARTE 2: Trigger para prevenir leads órfãos no futuro
CREATE OR REPLACE FUNCTION public.ensure_lead_has_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Se pipeline_id é NULL, buscar pipeline padrão da organização
  IF NEW.pipeline_id IS NULL THEN
    SELECT p.id, s.id INTO NEW.pipeline_id, NEW.stage_id
    FROM public.pipelines p
    JOIN public.stages s ON s.pipeline_id = p.id
    WHERE p.organization_id = NEW.organization_id
      AND p.is_default = true
    ORDER BY s.position ASC
    LIMIT 1;
  -- Se tem pipeline mas não tem stage, pegar primeiro stage
  ELSIF NEW.stage_id IS NULL THEN
    SELECT id INTO NEW.stage_id
    FROM public.stages
    WHERE pipeline_id = NEW.pipeline_id
    ORDER BY position ASC
    LIMIT 1;
  END IF;
  
  -- Garantir que stage_entered_at seja preenchido
  IF NEW.stage_entered_at IS NULL THEN
    NEW.stage_entered_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger BEFORE INSERT para garantir que leads sempre tenham pipeline/stage
DROP TRIGGER IF EXISTS tr_ensure_lead_pipeline ON public.leads;
CREATE TRIGGER tr_ensure_lead_pipeline
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.ensure_lead_has_pipeline();