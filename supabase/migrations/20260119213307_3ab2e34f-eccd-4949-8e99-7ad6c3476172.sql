-- Add missing role column to user_roles table
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'user';

-- Add unique constraint if not exists
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Insert super_admin role for the existing super admin user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM public.users
WHERE role = 'super_admin'
ON CONFLICT (user_id, role) DO NOTHING;