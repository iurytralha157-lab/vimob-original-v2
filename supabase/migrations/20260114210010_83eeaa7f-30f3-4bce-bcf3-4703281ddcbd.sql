-- Função para normalizar telefone (remover código do país 55 quando tiver 12+ dígitos)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone TEXT) 
RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN NULL;
  END IF;
  -- Remove todos caracteres não numéricos
  phone := regexp_replace(phone, '[^0-9]', '', 'g');
  -- Se começar com 55 e tiver 12+ dígitos, remove o 55
  IF length(phone) >= 12 AND phone LIKE '55%' THEN
    phone := substring(phone from 3);
  END IF;
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Limpar leads duplicados ANTES de criar o índice único
-- Mantém apenas o lead mais antigo para cada telefone normalizado
WITH duplicates AS (
  SELECT id, phone, organization_id,
    ROW_NUMBER() OVER (PARTITION BY organization_id, normalize_phone(phone) ORDER BY created_at ASC) as rn
  FROM leads
  WHERE phone IS NOT NULL AND phone != ''
)
DELETE FROM leads 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Índice único parcial para evitar duplicados (por organização + telefone normalizado)
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_phone_unique 
ON leads (organization_id, normalize_phone(phone)) 
WHERE phone IS NOT NULL AND phone != '';