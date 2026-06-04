-- Adicionar valores faltantes ao enum task_type
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'task';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'meeting';