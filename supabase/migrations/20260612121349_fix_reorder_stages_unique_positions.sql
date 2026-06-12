-- Save pipeline stage order atomically without colliding with
-- stages_unique_position_per_pipeline while positions are being swapped.

CREATE OR REPLACE FUNCTION public.reorder_stages(p_stages jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pipeline_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN
    RAISE EXCEPTION 'Stages payload must be a non-empty array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stages) AS stage_item
    WHERE NULLIF(stage_item->>'id', '') IS NULL
      OR NULLIF(stage_item->>'pipeline_id', '') IS NULL
      OR NULLIF(BTRIM(stage_item->>'name'), '') IS NULL
      OR NULLIF(stage_item->>'position', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each stage requires id, pipeline_id, name, and position';
  END IF;

  SELECT DISTINCT (stage_item->>'pipeline_id')::uuid
  INTO v_pipeline_id
  FROM jsonb_array_elements(p_stages) AS stage_item;

  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline id is required';
  END IF;

  IF (
    SELECT COUNT(DISTINCT stage_item->>'pipeline_id')
    FROM jsonb_array_elements(p_stages) AS stage_item
  ) <> 1 THEN
    RAISE EXCEPTION 'All stages must belong to the same pipeline';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = v_pipeline_id
      AND p.organization_id = public.get_user_organization_id()
  ) THEN
    RAISE EXCEPTION 'Pipeline not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.user_has_permission('settings_pipelines', v_user_id)
    OR (
      public.is_team_leader(v_user_id)
      AND public.is_pipeline_in_led_team(v_pipeline_id, v_user_id)
    )
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to manage pipeline stages';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stages) AS stage_item
    GROUP BY (stage_item->>'position')::int
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Stage positions must be unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stages) AS stage_item
    JOIN public.stages s ON s.id = (stage_item->>'id')::uuid
    WHERE s.pipeline_id <> v_pipeline_id
  ) THEN
    RAISE EXCEPTION 'Cannot move stages between pipelines';
  END IF;

  WITH parked AS (
    SELECT
      id,
      (-1000000000 - ROW_NUMBER() OVER (ORDER BY position, id))::integer AS temporary_position
    FROM public.stages
    WHERE pipeline_id = v_pipeline_id
  )
  UPDATE public.stages s
  SET position = parked.temporary_position
  FROM parked
  WHERE s.id = parked.id;

  INSERT INTO public.stages (
    id,
    pipeline_id,
    name,
    color,
    position,
    stage_key
  )
  SELECT
    (stage_item->>'id')::uuid,
    v_pipeline_id,
    NULLIF(BTRIM(stage_item->>'name'), ''),
    COALESCE(NULLIF(stage_item->>'color', ''), '#6b7280'),
    (stage_item->>'position')::int,
    COALESCE(
      NULLIF(BTRIM(stage_item->>'stage_key'), ''),
      regexp_replace(
        lower(NULLIF(BTRIM(stage_item->>'name'), '')),
        '[^a-z0-9]+',
        '_',
        'g'
      )
    )
  FROM jsonb_array_elements(p_stages) AS stage_item
  ON CONFLICT (id) DO UPDATE SET
    pipeline_id = EXCLUDED.pipeline_id,
    name = EXCLUDED.name,
    color = EXCLUDED.color,
    position = EXCLUDED.position,
    stage_key = EXCLUDED.stage_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_stages(jsonb) TO authenticated, service_role;
