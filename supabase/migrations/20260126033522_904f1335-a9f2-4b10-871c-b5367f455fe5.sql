-- Criar função RPC para Super Admin listar todos os usuários
-- Bypassa RLS e retorna todos os usuários do sistema

CREATE OR REPLACE FUNCTION public.list_all_users_admin()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  organization_id uuid,
  organization_name text,
  avatar_url text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem acessar esta função';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.organization_id,
    o.name as organization_name,
    u.avatar_url,
    u.is_active,
    u.created_at
  FROM public.users u
  LEFT JOIN public.organizations o ON o.id = u.organization_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Também criar função para listar organizações (mesmo problema)
CREATE OR REPLACE FUNCTION public.list_all_organizations_admin()
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  is_active boolean,
  subscription_status text,
  max_users integer,
  admin_notes text,
  created_at timestamptz,
  last_access_at timestamptz,
  user_count bigint,
  lead_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem acessar esta função';
  END IF;

  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.logo_url,
    COALESCE(o.is_active, true) as is_active,
    COALESCE(o.subscription_status, 'trial') as subscription_status,
    COALESCE(o.max_users, 10) as max_users,
    o.admin_notes,
    o.created_at,
    o.last_access_at,
    (SELECT COUNT(*) FROM public.users u WHERE u.organization_id = o.id)::bigint as user_count,
    (SELECT COUNT(*) FROM public.leads l WHERE l.organization_id = o.id)::bigint as lead_count
  FROM public.organizations o
  ORDER BY o.created_at DESC;
END;
$$;