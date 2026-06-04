-- Adicionar permissão pipeline_lock para travar movimentação de leads no Kanban
INSERT INTO available_permissions (key, name, description, category)
VALUES (
  'pipeline_lock',
  'Travar movimentação no pipeline',
  'Impede que o usuário arraste leads entre estágios no Kanban',
  'leads'
);