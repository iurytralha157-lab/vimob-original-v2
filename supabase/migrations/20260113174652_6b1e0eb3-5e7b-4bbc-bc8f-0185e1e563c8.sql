-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create webhooks" ON public.webhooks_integrations;
DROP POLICY IF EXISTS "Admins can update webhooks" ON public.webhooks_integrations;
DROP POLICY IF EXISTS "Admins can delete webhooks" ON public.webhooks_integrations;

-- Create new policies that allow all org users to manage webhooks
CREATE POLICY "Users can manage webhooks"
ON public.webhooks_integrations
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());