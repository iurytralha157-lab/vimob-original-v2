-- Atualizar função get_funnel_data para retornar apenas 5 estágios mais importantes
CREATE OR REPLACE FUNCTION public.get_funnel_data()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE s.stage_key NOT IN ('lost', 'fechado_perdido')
    GROUP BY s.id, s.name, s.stage_key, s.position
  ),
  -- Ordenar por quantidade de leads (desc) e pegar os 5 mais importantes
  top_stages AS (
    SELECT * FROM stage_counts
    ORDER BY value DESC, position ASC
    LIMIT 5
  ),
  -- Reordenar pelo position original para manter a ordem lógica do funil
  ordered_stages AS (
    SELECT * FROM top_stages
    ORDER BY position ASC
  ),
  total AS (
    SELECT SUM(value) as total_value FROM ordered_stages
  )
  SELECT json_agg(
    json_build_object(
      'name', CASE 
        WHEN stage_key = 'new' OR stage_key = 'novo_lead' THEN 'Novos Leads'
        WHEN stage_key IN ('contacted', 'active', 'contato_inicial') THEN 'Contato Inicial'
        WHEN stage_key IN ('meeting', 'visita_agendada') THEN 'Visita Agendada'
        WHEN stage_key IN ('negotiation', 'negociacao', 'proposta_enviada') THEN 'Negociação'
        WHEN stage_key IN ('closed', 'won', 'fechado_ganho') THEN 'Fechados'
        ELSE name
      END,
      'value', value,
      'stage_key', stage_key,
      'percentage', CASE WHEN t.total_value > 0 THEN ROUND((value::numeric / t.total_value) * 100) ELSE 0 END
    )
  ) INTO result
  FROM ordered_stages os
  CROSS JOIN total t;
  
  RETURN COALESCE(result, '[]'::json);
END;
$function$;