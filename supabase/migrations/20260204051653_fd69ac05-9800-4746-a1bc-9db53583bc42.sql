-- Rollback: Restaurar usuários originais dos leads redistribuídos
-- Baseado no histórico do lead_pool_history

UPDATE leads l
SET 
  assigned_user_id = rollback.original_user_id,
  assigned_at = NOW()
FROM (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    from_user_id as original_user_id
  FROM lead_pool_history
  WHERE organization_id = '818394bf-8c57-445e-be2f-b964c2569235'
    AND redistributed_at > NOW() - INTERVAL '20 minutes'
    AND from_user_id != to_user_id
  ORDER BY lead_id, redistributed_at ASC
) rollback
WHERE l.id = rollback.lead_id;

-- Desativar pool temporariamente para a organização Nexo
UPDATE pipelines
SET pool_enabled = false
WHERE organization_id = '818394bf-8c57-445e-be2f-b964c2569235';