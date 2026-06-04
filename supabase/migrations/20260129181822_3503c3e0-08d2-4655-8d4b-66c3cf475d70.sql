-- Adicionar novas permissões para módulos Telecom
INSERT INTO available_permissions (key, name, description, category) VALUES
('plans_view', 'Ver planos', 'Visualizar catálogo de planos de serviço', 'modules'),
('plans_edit', 'Editar planos', 'Criar, editar e excluir planos de serviço', 'modules'),
('coverage_view', 'Ver localidades', 'Visualizar áreas de cobertura', 'modules'),
('coverage_edit', 'Editar localidades', 'Criar, editar e excluir áreas de cobertura', 'modules'),
('customers_view_all', 'Ver todos os clientes', 'Visualizar todos os clientes telecom da organização', 'data'),
('customers_view_own', 'Ver próprios clientes', 'Visualizar apenas clientes criados por si', 'data'),
('customers_edit', 'Editar clientes', 'Criar, editar e excluir clientes telecom', 'data')
ON CONFLICT (key) DO NOTHING;