-- stage_operational_configs had RLS enabled without policies.

CREATE POLICY "Stage operational configs are viewable by organization members"
ON public.stage_operational_configs
FOR SELECT
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_operational_configs.stage_id
      AND p.organization_id = public.get_current_user_org_id()
  )
);

CREATE POLICY "Stage operational configs are insertable by pipeline managers"
ON public.stage_operational_configs
FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_operational_configs.stage_id
      AND p.organization_id = public.get_current_user_org_id()
      AND (
        public.is_admin()
        OR public.has_permission('settings_pipelines')
        OR EXISTS (
          SELECT 1
          FROM public.pipeline_team_permissions ptp
          WHERE ptp.pipeline_id = p.id
            AND ptp.user_id = auth.uid()
            AND COALESCE(ptp.can_edit, false)
        )
      )
  )
);

CREATE POLICY "Stage operational configs are updatable by pipeline managers"
ON public.stage_operational_configs
FOR UPDATE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_operational_configs.stage_id
      AND p.organization_id = public.get_current_user_org_id()
      AND (
        public.is_admin()
        OR public.has_permission('settings_pipelines')
        OR EXISTS (
          SELECT 1
          FROM public.pipeline_team_permissions ptp
          WHERE ptp.pipeline_id = p.id
            AND ptp.user_id = auth.uid()
            AND COALESCE(ptp.can_edit, false)
        )
      )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_operational_configs.stage_id
      AND p.organization_id = public.get_current_user_org_id()
      AND (
        public.is_admin()
        OR public.has_permission('settings_pipelines')
        OR EXISTS (
          SELECT 1
          FROM public.pipeline_team_permissions ptp
          WHERE ptp.pipeline_id = p.id
            AND ptp.user_id = auth.uid()
            AND COALESCE(ptp.can_edit, false)
        )
      )
  )
);

CREATE POLICY "Stage operational configs are deletable by pipeline managers"
ON public.stage_operational_configs
FOR DELETE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_operational_configs.stage_id
      AND p.organization_id = public.get_current_user_org_id()
      AND (
        public.is_admin()
        OR public.has_permission('settings_pipelines')
        OR EXISTS (
          SELECT 1
          FROM public.pipeline_team_permissions ptp
          WHERE ptp.pipeline_id = p.id
            AND ptp.user_id = auth.uid()
            AND COALESCE(ptp.can_edit, false)
        )
      )
  )
);
