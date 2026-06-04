
-- Add flow_definition JSONB column to automations
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS flow_definition jsonb;

-- Migrate existing automations: build flow_definition from automation_nodes + automation_connections
UPDATE public.automations a
SET flow_definition = (
  SELECT jsonb_build_object(
    'nodes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'type', n.node_type,
          'action_type', n.action_type,
          'position', jsonb_build_object('x', COALESCE(n.position_x, 0), 'y', COALESCE(n.position_y, 0)),
          'config', COALESCE(n.node_config, '{}'::jsonb)
        )
        ORDER BY n.created_at
      )
      FROM public.automation_nodes n
      WHERE n.automation_id = a.id
    ), '[]'::jsonb),
    'connections', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'source', c.source_node_id,
          'target', c.target_node_id,
          'source_handle', c.source_handle,
          'condition_branch', c.condition_branch
        )
      )
      FROM public.automation_connections c
      WHERE c.automation_id = a.id
    ), '[]'::jsonb),
    'settings', jsonb_build_object()
  )
)
WHERE a.flow_definition IS NULL;
