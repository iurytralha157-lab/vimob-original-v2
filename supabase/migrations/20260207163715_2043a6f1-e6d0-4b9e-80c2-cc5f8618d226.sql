-- Função para encontrar membros de equipe órfãos
CREATE OR REPLACE FUNCTION public.find_orphan_team_members()
RETURNS TABLE (
  member_id uuid,
  team_id uuid,
  user_id uuid,
  team_name text,
  reason text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tm.id,
    tm.team_id,
    tm.user_id,
    t.name,
    CASE 
      WHEN u.id IS NULL THEN 'user_deleted'
      WHEN u.organization_id IS NULL THEN 'user_no_org'
      WHEN u.organization_id != t.organization_id THEN 'org_mismatch'
    END::text
  FROM team_members tm
  JOIN teams t ON tm.team_id = t.id
  LEFT JOIN users u ON tm.user_id = u.id
  WHERE u.id IS NULL 
     OR u.organization_id IS NULL 
     OR u.organization_id != t.organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para encontrar membros de round-robin órfãos
CREATE OR REPLACE FUNCTION public.find_orphan_rr_members()
RETURNS TABLE (
  member_id uuid,
  round_robin_id uuid,
  user_id uuid,
  queue_name text,
  reason text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rrm.id,
    rrm.round_robin_id,
    rrm.user_id,
    rr.name,
    CASE 
      WHEN u.id IS NULL THEN 'user_deleted'
      WHEN u.organization_id IS NULL THEN 'user_no_org'
      WHEN u.organization_id != rr.organization_id THEN 'org_mismatch'
    END::text
  FROM round_robin_members rrm
  JOIN round_robins rr ON rrm.round_robin_id = rr.id
  LEFT JOIN users u ON rrm.user_id = u.id
  WHERE u.id IS NULL 
     OR u.organization_id IS NULL 
     OR u.organization_id != rr.organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para executar a limpeza (usada pela Edge Function)
CREATE OR REPLACE FUNCTION public.cleanup_orphan_members()
RETURNS jsonb AS $$
DECLARE
  team_deleted_count int := 0;
  rr_deleted_count int := 0;
  deleted_count int;
BEGIN
  -- 1. Deletar membros de equipe onde usuário tem org NULL ou org diferente
  WITH deleted AS (
    DELETE FROM team_members tm
    USING teams t
    WHERE tm.team_id = t.id
      AND tm.user_id IN (
        SELECT u.id FROM users u 
        WHERE u.organization_id IS NULL 
           OR u.organization_id != t.organization_id
      )
    RETURNING tm.id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  team_deleted_count := team_deleted_count + deleted_count;

  -- 2. Deletar membros de equipe onde usuário não existe mais
  WITH deleted AS (
    DELETE FROM team_members 
    WHERE user_id NOT IN (SELECT id FROM users)
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  team_deleted_count := team_deleted_count + deleted_count;

  -- 3. Deletar membros de round-robin onde usuário tem org NULL ou org diferente
  WITH deleted AS (
    DELETE FROM round_robin_members rrm
    USING round_robins rr
    WHERE rrm.round_robin_id = rr.id
      AND rrm.user_id IN (
        SELECT u.id FROM users u 
        WHERE u.organization_id IS NULL 
           OR u.organization_id != rr.organization_id
      )
    RETURNING rrm.id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  rr_deleted_count := rr_deleted_count + deleted_count;

  -- 4. Deletar membros de round-robin onde usuário não existe mais
  WITH deleted AS (
    DELETE FROM round_robin_members 
    WHERE user_id NOT IN (SELECT id FROM users)
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  rr_deleted_count := rr_deleted_count + deleted_count;

  RETURN jsonb_build_object(
    'team_members_removed', team_deleted_count,
    'round_robin_members_removed', rr_deleted_count,
    'executed_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;