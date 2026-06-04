-- ETAPA 1: Adicionar coluna default_commission_percentage na organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS default_commission_percentage numeric(5,2) DEFAULT 5.0;

-- Comentário explicativo
COMMENT ON COLUMN public.organizations.default_commission_percentage IS 'Percentual padrão de comissão quando não definido no lead ou imóvel';

-- ETAPA 3: Configurar cron job para recurring-entries-generator
-- Executa diariamente às 06:00 UTC
SELECT cron.schedule(
  'recurring-entries-generator',
  '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/recurring-entries-generator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjQ1ODYsImV4cCI6MjA4MzUwMDU4Nn0.81N4uCUaIFOm7DHMaHa9Rhh-OoY06j6Ig4AFibzXuQU'
    ),
    body := '{}'::jsonb
  )$$
);

-- ETAPA 5: Criar função para sincronizar comissões históricas
-- Esta função será chamada uma vez para migrar leads won existentes
CREATE OR REPLACE FUNCTION public.sync_historical_commissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_record RECORD;
  commission_percentage numeric;
  commission_amount numeric;
  created_count integer := 0;
  skipped_count integer := 0;
BEGIN
  -- Buscar todos os leads won sem comissão
  FOR lead_record IN 
    SELECT l.id, l.organization_id, l.assigned_user_id, l.property_id, 
           l.valor_interesse, l.commission_percentage as lead_commission,
           p.commission_percentage as property_commission,
           o.default_commission_percentage as org_commission
    FROM leads l
    LEFT JOIN properties p ON p.id = l.property_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    LEFT JOIN commissions c ON c.lead_id = l.id
    WHERE l.deal_status = 'won'
      AND l.valor_interesse > 0
      AND c.id IS NULL
  LOOP
    -- Determinar percentual de comissão (lead -> property -> organization -> default 5%)
    commission_percentage := COALESCE(
      NULLIF(lead_record.lead_commission, 0),
      NULLIF(lead_record.property_commission, 0),
      NULLIF(lead_record.org_commission, 0),
      5.0
    );
    
    commission_amount := lead_record.valor_interesse * (commission_percentage / 100);
    
    -- Pular se não tem user atribuído
    IF lead_record.assigned_user_id IS NULL THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;
    
    -- Criar comissão
    INSERT INTO commissions (
      organization_id,
      lead_id,
      user_id,
      property_id,
      base_value,
      amount,
      percentage,
      status,
      notes
    ) VALUES (
      lead_record.organization_id,
      lead_record.id,
      lead_record.assigned_user_id,
      lead_record.property_id,
      lead_record.valor_interesse,
      commission_amount,
      commission_percentage,
      'forecast',
      'Comissão gerada automaticamente (migração)'
    );
    
    created_count := created_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'created', created_count,
    'skipped', skipped_count,
    'message', format('Criadas %s comissões, %s ignoradas (sem responsável)', created_count, skipped_count)
  );
END;
$$;