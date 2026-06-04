-- Inserir comissão para o lead de teste que já foi marcado como ganho
INSERT INTO commissions (organization_id, lead_id, user_id, base_value, amount, percentage, status, notes)
SELECT 
  'cd868dbb-924d-4e14-9bc8-5d3e67f44c3d',
  'be635892-31ff-402b-8c12-d158bab36a1c',
  '4ad539ef-1e16-4c43-9cad-0e3c76b2949b',
  250000, 
  12500, 
  5, 
  'forecast', 
  'Comissão criada manualmente (teste)'
WHERE NOT EXISTS (
  SELECT 1 FROM commissions WHERE lead_id = 'be635892-31ff-402b-8c12-d158bab36a1c'
);

-- Inserir conta a receber para o lead de teste
INSERT INTO financial_entries (organization_id, lead_id, type, amount, due_date, status, description)
SELECT 
  'cd868dbb-924d-4e14-9bc8-5d3e67f44c3d',
  'be635892-31ff-402b-8c12-d158bab36a1c',
  'receivable', 
  250000,
  (CURRENT_DATE + INTERVAL '30 days')::date,
  'pending', 
  'Venda - Lead Teste Financeiro'
WHERE NOT EXISTS (
  SELECT 1 FROM financial_entries WHERE lead_id = 'be635892-31ff-402b-8c12-d158bab36a1c' AND type = 'receivable'
);