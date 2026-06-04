-- Corrigir foreign key para permitir exclusão de round robins
-- Usa SET NULL para preservar histórico de atribuições

ALTER TABLE public.assignments_log 
DROP CONSTRAINT IF EXISTS assignments_log_round_robin_id_fkey;

ALTER TABLE public.assignments_log 
ADD CONSTRAINT assignments_log_round_robin_id_fkey 
FOREIGN KEY (round_robin_id) REFERENCES public.round_robins(id) 
ON DELETE SET NULL;