-- Create the organization_api_keys table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.organization_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy for organization members to see their keys
CREATE POLICY "Members can view their organization api keys" ON public.organization_api_keys
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
        AND organization_id = organization_api_keys.organization_id
    )
);

-- Policy for admins to create/manage keys
CREATE POLICY "Admins can manage organization api keys" ON public.organization_api_keys
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
        AND organization_id = organization_api_keys.organization_id
        AND role = 'admin'
    )
);

-- Create the generate_organization_api_key function
CREATE OR REPLACE FUNCTION public.generate_organization_api_key(p_name TEXT, p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_api_key TEXT;
    v_key_prefix TEXT := 'vk_';
    v_random_part TEXT;
BEGIN
    -- Check if user is admin of the organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
        AND organization_id = p_organization_id
        AND role = 'admin'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem criar chaves de API.';
    END IF;

    -- Generate a random string
    v_random_part := encode(gen_random_bytes(24), 'base64');
    -- Clean up base64 characters that might be problematic in some contexts
    v_random_part := replace(replace(replace(v_random_part, '/', ''), '+', ''), '=', '');
    v_api_key := v_key_prefix || v_random_part;

    -- Store the hash of the key
    INSERT INTO public.organization_api_keys (
        organization_id,
        name,
        key_hash,
        created_by
    ) VALUES (
        p_organization_id,
        p_name,
        crypt(v_api_key, gen_salt('bf')),
        auth.uid()
    );

    RETURN v_api_key;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_organization_api_key(TEXT, UUID) TO authenticated;
