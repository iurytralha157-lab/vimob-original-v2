-- RPC para estatísticas do banco de dados (Super Admin only)
CREATE OR REPLACE FUNCTION public.get_database_stats_admin()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Verificar se é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins 
    WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT json_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'tables', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT 
          tablename as name,
          pg_total_relation_size('public.' || tablename) as size_bytes,
          pg_size_pretty(pg_total_relation_size('public.' || tablename)) as size_pretty,
          (SELECT reltuples::bigint FROM pg_class WHERE oid = ('public.' || tablename)::regclass) as estimated_rows
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size('public.' || tablename) DESC
        LIMIT 15
      ) t
    ),
    'storage', (
      SELECT json_build_object(
        'count', COUNT(*),
        'size_bytes', COALESCE(SUM((metadata->>'size')::bigint), 0)
      )
      FROM storage.objects
    ),
    'counts', json_build_object(
      'whatsapp_messages', (SELECT COUNT(*) FROM whatsapp_messages),
      'notifications', (SELECT COUNT(*) FROM notifications),
      'activities', (SELECT COUNT(*) FROM activities),
      'audit_logs', (SELECT COUNT(*) FROM audit_logs),
      'leads', (SELECT COUNT(*) FROM leads),
      'users', (SELECT COUNT(*) FROM users),
      'organizations', (SELECT COUNT(*) FROM organizations)
    )
  ) INTO result;

  RETURN result;
END;
$$;