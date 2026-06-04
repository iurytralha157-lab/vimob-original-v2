INSERT INTO available_permissions (key, name, description, category)
VALUES 
('module_campaigns', 'Acesso a Campanhas', 'Permite visualizar o dashboard de campanhas do Meta', 'modules'),
('module_gamification', 'Acesso a Gamificação', 'Permite visualizar o sistema de gamificação e performance', 'modules')
ON CONFLICT (key) DO NOTHING;
