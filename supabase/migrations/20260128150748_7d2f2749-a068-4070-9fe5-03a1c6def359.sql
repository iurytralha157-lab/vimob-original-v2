-- Atualizar foreign keys para cascade delete quando usuário é removido

-- 1. team_members: remover da equipe quando usuário deletado
ALTER TABLE public.team_members 
DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;

ALTER TABLE public.team_members 
ADD CONSTRAINT team_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 2. round_robin_members: remover da fila quando usuário deletado
ALTER TABLE public.round_robin_members 
DROP CONSTRAINT IF EXISTS round_robin_members_user_id_fkey;

ALTER TABLE public.round_robin_members 
ADD CONSTRAINT round_robin_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 3. whatsapp_session_access: remover acesso quando usuário deletado
ALTER TABLE public.whatsapp_session_access 
DROP CONSTRAINT IF EXISTS whatsapp_session_access_user_id_fkey;

ALTER TABLE public.whatsapp_session_access 
ADD CONSTRAINT whatsapp_session_access_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. user_organization_roles: remover função quando usuário deletado
ALTER TABLE public.user_organization_roles 
DROP CONSTRAINT IF EXISTS user_organization_roles_user_id_fkey;

ALTER TABLE public.user_organization_roles 
ADD CONSTRAINT user_organization_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 5. member_availability: remover disponibilidade quando team_member deletado
ALTER TABLE public.member_availability 
DROP CONSTRAINT IF EXISTS member_availability_team_member_id_fkey;

ALTER TABLE public.member_availability 
ADD CONSTRAINT member_availability_team_member_id_fkey 
FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;

-- 6. Limpar registros órfãos existentes (usuários deletados)
DELETE FROM public.team_members 
WHERE user_id NOT IN (SELECT id FROM public.users);

DELETE FROM public.round_robin_members 
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.users);

DELETE FROM public.whatsapp_session_access 
WHERE user_id NOT IN (SELECT id FROM public.users);

DELETE FROM public.user_organization_roles 
WHERE user_id NOT IN (SELECT id FROM public.users);