
-- 1. Remover Maikson órfão da fila round-robin
DELETE FROM round_robin_members 
WHERE id = '4ecfa57a-7500-45b5-b290-2f96c4a17032';

-- 2. Remover automação duplicada (mantendo a mais antiga)
DELETE FROM stage_automations 
WHERE id = '6b05922e-fa61-49ee-82ba-5233ae0e2155';
