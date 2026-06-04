-- Otimiza a tela de Pipeline: cada coluna busca os cards mais recentes por
-- pipeline/estagio e ordena por entrada no estagio. Sem este indice, colunas
-- com muitos leads podem fazer varredura/ordenacao pesada antes de renderizar.
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_entered_desc
ON public.leads (pipeline_id, stage_id, stage_entered_at DESC, created_at DESC);

-- A paginacao e os filtros por responsavel usam a mesma ordem na Pipeline.
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_assignee_entered_desc
ON public.leads (pipeline_id, stage_id, assigned_user_id, stage_entered_at DESC, created_at DESC)
WHERE assigned_user_id IS NOT NULL;
