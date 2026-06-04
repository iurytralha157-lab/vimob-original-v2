-- Add missing columns to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial' NOT NULL,
ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 10 NOT NULL,
ADD COLUMN IF NOT EXISTS admin_notes text,
ADD COLUMN IF NOT EXISTS last_access_at timestamp with time zone;