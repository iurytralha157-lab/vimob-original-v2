-- Restaurar estágios originais dos leads redistribuídos pelo bolsão
-- Baseado no histórico de activities (stage_change) antes da redistribuição às 05:08 UTC

UPDATE leads l
SET 
  stage_id = estagio.stage_id_antes,
  stage_entered_at = NOW()
FROM (
  SELECT DISTINCT ON (a.lead_id)
    a.lead_id,
    (a.metadata->>'to_stage_id')::uuid as stage_id_antes
  FROM activities a
  WHERE a.type = 'stage_change'
    AND a.created_at < '2026-02-04 05:08:00+00'
    AND a.lead_id IN (
      SELECT DISTINCT lead_id 
      FROM lead_pool_history 
      WHERE organization_id = '818394bf-8c57-445e-be2f-b964c2569235'
        AND redistributed_at > NOW() - INTERVAL '30 minutes'
    )
  ORDER BY a.lead_id, a.created_at DESC
) estagio
WHERE l.id = estagio.lead_id
  AND l.stage_id != estagio.stage_id_antes;