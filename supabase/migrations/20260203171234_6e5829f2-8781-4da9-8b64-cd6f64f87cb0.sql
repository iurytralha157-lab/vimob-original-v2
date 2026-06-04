-- Create feature_requests table for improvement suggestions
CREATE TABLE public.feature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL, -- pipeline, dashboard, whatsapp, agenda, etc.
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, analyzing, approved, rejected
  admin_response TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own requests"
ON public.feature_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create requests
CREATE POLICY "Users can create requests"
ON public.feature_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Super admins can view all requests
CREATE POLICY "Super admins can view all requests"
ON public.feature_requests
FOR SELECT
USING (public.is_super_admin());

-- Super admins can update requests (respond)
CREATE POLICY "Super admins can update requests"
ON public.feature_requests
FOR UPDATE
USING (public.is_super_admin());

-- Super admins can delete requests
CREATE POLICY "Super admins can delete requests"
ON public.feature_requests
FOR DELETE
USING (public.is_super_admin());

-- Create index for faster queries
CREATE INDEX idx_feature_requests_organization ON public.feature_requests(organization_id);
CREATE INDEX idx_feature_requests_user ON public.feature_requests(user_id);
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);

-- Trigger for updated_at
CREATE TRIGGER update_feature_requests_updated_at
BEFORE UPDATE ON public.feature_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();