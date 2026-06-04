CREATE OR REPLACE FUNCTION public.list_all_organizations_admin()
 RETURNS TABLE(
   id uuid, 
   name text, 
   logo_url text, 
   is_active boolean, 
   subscription_status text, 
   max_users integer, 
   admin_notes text, 
   created_at timestamp with time zone, 
   last_access_at timestamp with time zone, 
   user_count bigint, 
   lead_count bigint,
   plan_id uuid,
   subscription_value numeric,
   billing_day integer,
   next_billing_date date,
   asaas_customer_id text,
   asaas_subscription_id text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (SELECT COUNT(*) FROM public.leads l WHERE l.organization_id = o.id)::bigint as lead_count,
    o.plan_id,
    o.subscription_value,
    o.billing_day,
    o.next_billing_date,
    o.asaas_customer_id,
    o.asaas_subscription_id
  FROM public.organizations o
  ORDER BY o.created_at DESC;
END;
$function$;
