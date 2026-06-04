-- 1. Marcar um pipeline como padrão para cada organização que não tem
UPDATE pipelines p1
SET is_default = true
WHERE p1.is_default = false
  AND p1.id = (
    SELECT p2.id 
    FROM pipelines p2 
    WHERE p2.organization_id = p1.organization_id 
      AND NOT EXISTS (
        SELECT 1 FROM pipelines p3 
        WHERE p3.organization_id = p1.organization_id 
          AND p3.is_default = true
      )
    ORDER BY p2.created_at ASC 
    LIMIT 1
  );

-- 2. Recriar a função get_funnel_data com fallback para pipeline não-padrão
CREATE OR REPLACE FUNCTION public.get_funnel_data()
RETURNS TABLE(name text, value bigint, percentage numeric, stage_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_pipeline_id uuid;
  v_total bigint;
BEGIN
  -- Get user's organization
  v_org_id := get_user_organization_id();
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get default pipeline, or fallback to first pipeline if none is default
  SELECT p.id INTO v_pipeline_id
  FROM pipelines p
  WHERE p.organization_id = v_org_id
  ORDER BY p.is_default DESC, p.created_at ASC
  LIMIT 1;
  
  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get total leads in this pipeline
  SELECT COUNT(*) INTO v_total
  FROM leads l
  JOIN stages s ON l.stage_id = s.id
  WHERE s.pipeline_id = v_pipeline_id;
  
  -- Return funnel data
  RETURN QUERY
  SELECT 
    s.name,
    COUNT(l.id)::bigint as value,
    CASE 
      WHEN v_total > 0 THEN ROUND((COUNT(l.id)::numeric / v_total) * 100, 1)
      ELSE 0
    END as percentage,
    s.stage_key
  FROM stages s
  LEFT JOIN leads l ON l.stage_id = s.id
  WHERE s.pipeline_id = v_pipeline_id
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position ASC;
END;
$$;