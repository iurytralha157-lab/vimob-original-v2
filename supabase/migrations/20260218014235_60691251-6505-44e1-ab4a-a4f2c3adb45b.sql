
-- 1. CASCADE em stages -> pipelines
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_pipeline_id_fkey;
ALTER TABLE stages ADD CONSTRAINT stages_pipeline_id_fkey 
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE;

-- 2. Funcao RPC para reorder em batch
CREATE OR REPLACE FUNCTION reorder_stages(p_stages jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  stage_item jsonb;
BEGIN
  FOR stage_item IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    UPDATE stages SET 
      position = (stage_item->>'position')::int,
      name = stage_item->>'name',
      color = stage_item->>'color'
    WHERE id = (stage_item->>'id')::uuid;
  END LOOP;
END;
$$;
