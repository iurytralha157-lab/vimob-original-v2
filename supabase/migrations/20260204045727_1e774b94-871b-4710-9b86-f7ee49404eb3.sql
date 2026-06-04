-- Corrigir automações change_deal_status_on_enter que estão sem action_config
-- Inferir o status baseado no nome do estágio

-- Automações de "Perdido" sem config
UPDATE stage_automations sa
SET action_config = '{"deal_status": "lost"}'::jsonb
FROM stages s
WHERE sa.stage_id = s.id
  AND sa.automation_type = 'change_deal_status_on_enter'
  AND (sa.action_config IS NULL OR sa.action_config = '{}')
  AND (LOWER(s.name) LIKE '%perdido%' OR LOWER(s.name) LIKE '%lost%');

-- Automações de "Ganho/Fechado" sem config  
UPDATE stage_automations sa
SET action_config = '{"deal_status": "won"}'::jsonb
FROM stages s
WHERE sa.stage_id = s.id
  AND sa.automation_type = 'change_deal_status_on_enter'
  AND (sa.action_config IS NULL OR sa.action_config = '{}')
  AND (LOWER(s.name) LIKE '%ganho%' OR LOWER(s.name) LIKE '%won%' OR LOWER(s.name) LIKE '%fechado%' OR LOWER(s.name) LIKE '%closed%');