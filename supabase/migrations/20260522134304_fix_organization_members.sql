INSERT INTO organization_members (user_id, organization_id, role, is_active)
VALUES 
('006e75c2-f1d0-41a3-9e46-10148165a0a1', '3a90575d-77c6-4282-a609-176b282cd6e6', 'admin', true),
('12ec511f-44c1-4b4a-aeb5-2267212b8d32', '818394bf-8c57-445e-be2f-b964c2569235', 'user', true),
('f4159a86-ebb5-4212-b25e-2665db232526', '3f42e33f-f158-4a82-a695-560c8a562803', 'admin', true),
('b5442f74-35f3-4765-a3be-f7720d259f90', '1ac29acd-faad-487f-9482-2c9ae92b535d', 'admin', true),
('0de19b2a-d5be-45c6-b4d9-fbc69100feaf', 'cd868dbb-924d-4e14-9bc8-5d3e67f44c3d', 'user', true),
('f6be6fe3-7f37-4ebd-874f-104bb55ddcaf', '503cb1e4-0097-4572-bb44-c7956d825b63', 'admin', true),
('a0195b1a-ece5-4fc6-9d7d-81f529012d45', '93933356-27e6-4bab-9454-6a766aa3b9cb', 'admin', true),
('4acf7281-22ed-4550-b01b-d5580a7069c9', 'cf3eb75a-113b-4813-bdbd-13371c6aa8af', 'admin', true)
ON CONFLICT (user_id, organization_id) DO UPDATE SET is_active = true;
