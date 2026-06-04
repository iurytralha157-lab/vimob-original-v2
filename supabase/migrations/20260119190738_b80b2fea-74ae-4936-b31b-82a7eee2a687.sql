-- Set companyvetter@gmail.com as super_admin
UPDATE public.users 
SET role = 'super_admin' 
WHERE email = 'companyvetter@gmail.com';