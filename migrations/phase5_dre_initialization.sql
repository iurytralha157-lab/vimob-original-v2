-- PARTE 1: Função para inicializar categorias padrões para uma organização
CREATE OR REPLACE FUNCTION public.initialize_organization_financial_categories(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Receitas
  INSERT INTO public.financial_categories (organization_id, name, type, category_group)
  VALUES 
    (p_org_id, 'Venda de Imóveis', 'income', 'gross_revenue'),
    (p_org_id, 'Comissões Recebidas', 'income', 'gross_revenue'),
    (p_org_id, 'Aluguéis', 'income', 'gross_revenue'),
    (p_org_id, 'Outras Receitas', 'income', 'gross_revenue')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- Deduções
  INSERT INTO public.financial_categories (organization_id, name, type, category_group)
  VALUES 
    (p_org_id, 'Impostos sobre Vendas', 'expense', 'tax_deduction'),
    (p_org_id, 'Cancelamentos/Devoluções', 'expense', 'tax_deduction')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- Custos Variáveis
  INSERT INTO public.financial_categories (organization_id, name, type, category_group)
  VALUES 
    (p_org_id, 'Comissões Pagas (Corretores)', 'expense', 'variable_cost'),
    (p_org_id, 'Marketing e Leads', 'expense', 'variable_cost'),
    (p_org_id, 'Taxas de Franquia', 'expense', 'variable_cost'),
    (p_org_id, 'Custos de Obra/Reforma', 'expense', 'variable_cost')
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- Custos Fixos
  INSERT INTO public.financial_categories (organization_id, name, type, category_group)
  VALUES 
    (p_org_id, 'Aluguel Escritório', 'expense', 'fixed_cost'),
    (p_org_id, 'Salários e Encargos', 'expense', 'fixed_cost'),
    (p_org_id, 'Softwares e Tecnologia', 'expense', 'fixed_cost'),
    (p_org_id, 'Energia/Água/Internet', 'expense', 'fixed_cost'),
    (p_org_id, 'Material de Escritório', 'expense', 'fixed_cost')
  ON CONFLICT (organization_id, name) DO NOTHING;
END;
$$;

-- PARTE 2: Trigger para novos registros em organizations
CREATE OR REPLACE FUNCTION public.on_organization_created_init_financial()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.initialize_organization_financial_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_on_org_created_init_financial ON public.organizations;
CREATE TRIGGER tr_on_org_created_init_financial
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.on_organization_created_init_financial();

-- PARTE 3: Inicializar para as organizações existentes
DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id FROM public.organizations LOOP
    PERFORM public.initialize_organization_financial_categories(org_record.id);
  END LOOP;
END;
$$;
