-- Sincronizar leads históricos: criar comissões para leads won sem comissão
INSERT INTO commissions (organization_id, lead_id, user_id, base_value, amount, percentage, status, notes)
SELECT 
  l.organization_id,
  l.id as lead_id,
  l.assigned_user_id as user_id,
  l.valor_interesse as base_value,
  l.valor_interesse * (COALESCE(l.commission_percentage, o.default_commission_percentage, 5) / 100) as amount,
  COALESCE(l.commission_percentage, o.default_commission_percentage, 5) as percentage,
  'forecast' as status,
  'Comissão gerada retroativamente' as notes
FROM leads l
JOIN organizations o ON l.organization_id = o.id
WHERE l.deal_status = 'won'
  AND l.valor_interesse > 0
  AND l.assigned_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.lead_id = l.id);

-- Criar receivables para leads won sem entry vinculado
INSERT INTO financial_entries (organization_id, lead_id, type, description, amount, due_date, status, created_at)
SELECT 
  l.organization_id,
  l.id as lead_id,
  'receivable' as type,
  'Venda - ' || l.name as description,
  l.valor_interesse as amount,
  COALESCE((l.won_at::date + interval '30 days')::date, (now() + interval '30 days')::date) as due_date,
  'pending' as status,
  now() as created_at
FROM leads l
WHERE l.deal_status = 'won'
  AND l.valor_interesse > 0
  AND NOT EXISTS (SELECT 1 FROM financial_entries fe WHERE fe.lead_id = l.id AND fe.type = 'receivable');