-- Alterar a foreign key de leads.stage_id para usar SET NULL ao deletar
-- Isso permite deletar stages mesmo quando há leads associados

-- Primeiro, remover a constraint existente
ALTER TABLE public.leads 
DROP CONSTRAINT IF EXISTS leads_stage_id_fkey;

-- Recriar a constraint com ON DELETE SET NULL
ALTER TABLE public.leads 
ADD CONSTRAINT leads_stage_id_fkey 
FOREIGN KEY (stage_id) 
REFERENCES public.stages(id) 
ON DELETE SET NULL;