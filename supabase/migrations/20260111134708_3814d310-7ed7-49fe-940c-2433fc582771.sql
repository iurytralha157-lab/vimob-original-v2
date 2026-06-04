-- 1. Adicionar campos extras na tabela users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS complemento TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS cidade TEXT,
ADD COLUMN IF NOT EXISTS uf TEXT;

-- 2. Adicionar campos extras na tabela organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS cnpj TEXT,
ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
ADD COLUMN IF NOT EXISTS razao_social TEXT,
ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS complemento TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS cidade TEXT,
ADD COLUMN IF NOT EXISTS uf TEXT,
ADD COLUMN IF NOT EXISTS telefone TEXT,
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS website TEXT;

-- 3. Super admin pode ver todas as pipelines
CREATE POLICY "Super admin can view all pipelines"
ON public.pipelines
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all pipelines"
ON public.pipelines
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 4. Super admin pode ver todos os stages
CREATE POLICY "Super admin can view all stages"
ON public.stages
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all stages"
ON public.stages
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 5. Super admin pode ver todos os leads
CREATE POLICY "Super admin can view all leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all leads"
ON public.leads
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 6. Super admin pode ver todas as teams
CREATE POLICY "Super admin can view all teams"
ON public.teams
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all teams"
ON public.teams
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 7. Super admin pode ver todos os team_members
CREATE POLICY "Super admin can view all team_members"
ON public.team_members
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all team_members"
ON public.team_members
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 8. Super admin pode ver todos os team_pipelines
CREATE POLICY "Super admin can view all team_pipelines"
ON public.team_pipelines
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all team_pipelines"
ON public.team_pipelines
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 9. Super admin pode ver todas as meta_integrations
CREATE POLICY "Super admin can view all meta_integrations"
ON public.meta_integrations
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all meta_integrations"
ON public.meta_integrations
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 10. Super admin pode ver todos os meta_form_configs
CREATE POLICY "Super admin can view all meta_form_configs"
ON public.meta_form_configs
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all meta_form_configs"
ON public.meta_form_configs
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());