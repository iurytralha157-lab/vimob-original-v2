-- Replace broad pipeline SLA and stage automation policies with operation-specific policies.

DROP POLICY IF EXISTS "Org access to pipeline_sla_settings" ON public.pipeline_sla_settings;

CREATE POLICY "Pipeline SLA settings are viewable by organization members"
ON public.pipeline_sla_settings
FOR SELECT
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = pipeline_sla_settings.pipeline_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Pipeline SLA settings are insertable by pipeline managers"
ON public.pipeline_sla_settings
FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = pipeline_sla_settings.pipeline_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);

CREATE POLICY "Pipeline SLA settings are updatable by pipeline managers"
ON public.pipeline_sla_settings
FOR UPDATE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = pipeline_sla_settings.pipeline_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = pipeline_sla_settings.pipeline_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);

CREATE POLICY "Pipeline SLA settings are deletable by pipeline managers"
ON public.pipeline_sla_settings
FOR DELETE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = pipeline_sla_settings.pipeline_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);

DROP POLICY IF EXISTS "Org access to stage_automations" ON public.stage_automations;

CREATE POLICY "Stage automations are viewable by organization members"
ON public.stage_automations
FOR SELECT
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_automations.stage_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Stage automations are insertable by automation managers"
ON public.stage_automations
FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_automations.stage_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('automations_edit', auth.uid())
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);

CREATE POLICY "Stage automations are updatable by automation managers"
ON public.stage_automations
FOR UPDATE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_automations.stage_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('automations_edit', auth.uid())
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
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
    WHERE s.id = stage_automations.stage_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('automations_edit', auth.uid())
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);

CREATE POLICY "Stage automations are deletable by automation managers"
ON public.stage_automations
FOR DELETE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = stage_automations.stage_id
      AND p.organization_id = public.get_user_organization_id()
      AND (
        public.is_admin()
        OR public.user_has_permission('automations_edit', auth.uid())
        OR public.user_has_permission('settings_pipelines', auth.uid())
        OR (
          public.is_team_leader(auth.uid())
          AND p.id IN (SELECT public.get_user_led_pipeline_ids())
        )
      )
  )
);
