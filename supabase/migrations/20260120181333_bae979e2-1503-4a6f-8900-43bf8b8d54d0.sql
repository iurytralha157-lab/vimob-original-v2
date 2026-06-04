-- =============================================
-- CORREÇÃO DAS FUNÇÕES RESTANTES COM search_path MUTÁVEL
-- =============================================

-- Corrigir handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.users (id, email, name, role, is_active, organization_id, avatar_url, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'user',
    true,
    null,
    null,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Corrigir handle_new_auth_user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.users (
    id,
    email,
    name,
    role,
    is_active,
    organization_id,
    avatar_url,
    created_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'admin',
    true,
    null,
    null,
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name;

  return new;
end;
$$;

-- Corrigir normalize_phone (IMMUTABLE, não precisa de SECURITY DEFINER mas precisa de search_path)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');
  
  IF length(cleaned) > 11 AND substring(cleaned, 1, 2) = '55' THEN
    RETURN cleaned;
  END IF;
  
  IF length(cleaned) >= 10 AND length(cleaned) <= 11 THEN
    RETURN '55' || cleaned;
  END IF;
  
  RETURN cleaned;
END;
$$;