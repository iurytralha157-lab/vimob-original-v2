-- Create organization_api_keys table
CREATE TABLE IF NOT EXISTS public.organization_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    name TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies for organization_api_keys
CREATE POLICY "Admins can view their organization's API keys"
    ON public.organization_api_keys
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = organization_api_keys.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can create API keys for their organization"
    ON public.organization_api_keys
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = organization_api_keys.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can delete their organization's API keys"
    ON public.organization_api_keys
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = organization_api_keys.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Add module 'api' to valid modules if there's a constraint or check
-- (Assuming organization_modules accepts any module_name for now based on previous query)

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.organization_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

