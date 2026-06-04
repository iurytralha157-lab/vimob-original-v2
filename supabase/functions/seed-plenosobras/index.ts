import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const v_org_id = '03a4d0b1-339f-4afa-8424-40f0799d0446';
    
    // 1. Get User
    const { data: users } = await supabase.from('users').select('id').eq('organization_id', v_org_id).limit(1);
    if (!users || users.length === 0) throw new Error("Nenhum usuário encontrado para Plenosobras.");
    const v_user_id = users[0].id;

    // 2. Create Property
    const { data: property, error: propErr } = await supabase.from('properties').insert({
      organization_id: v_org_id,
      title: 'Terreno Teste - Loteamento Alpha',
      descricao: 'Lote plano pronto para construir',
      code: 'TR-' + Math.floor(Math.random() * 1000),
      tipo_de_imovel: 'land',
      tipo_de_negocio: 'sale',
      preco: 150000,
      status: 'available'
    }).select().single();
    if (propErr) throw propErr;

    // 3. Create Lead
    const { data: pipeline } = await supabase.from('pipelines').select('id').eq('organization_id', v_org_id).eq('name', 'Fluxo Operacional Obras').single();
    const { data: stage } = await supabase.from('stages').select('id').eq('pipeline_id', pipeline?.id).eq('position', 1).single();

    const { data: lead, error: leadErr } = await supabase.from('leads').insert({
      organization_id: v_org_id,
      pipeline_id: pipeline?.id,
      stage_id: stage?.id,
      name: 'Cliente Teste Enterprise',
      phone: '(11) 99999-9999',
      email: 'teste@plenosobras.com.br',
      source: 'site',
      valor_interesse: 450000,
      assigned_user_id: v_user_id
    }).select().single();
    if (leadErr) throw leadErr;

    // 4. Create Project
    const { data: project, error: projErr } = await supabase.from('construction_projects').insert({
      organization_id: v_org_id,
      property_id: property.id,
      name: 'Obra Residencial Alpha - Cliente Teste',
      description: 'Construção de alto padrão',
      status: 'in_progress',
      budget_estimated: 450000,
      physical_progress_percent: 15,
      start_date_planned: new Date().toISOString(),
      end_date_planned: new Date(Date.now() + 1000 * 60 * 60 * 24 * 240).toISOString(), // 8 months
      created_by: v_user_id
    }).select().single();
    if (projErr) throw projErr;

    // 5. Milestones
    await supabase.from('construction_milestones').insert([
      { project_id: project.id, organization_id: v_org_id, name: 'Projetos e Aprovações', order_index: 1, status: 'completed', weight: 5 },
      { project_id: project.id, organization_id: v_org_id, name: 'Fundação e Baldrame', order_index: 2, status: 'in_progress', weight: 15 },
      { project_id: project.id, organization_id: v_org_id, name: 'Alvenaria e Laje 1', order_index: 3, status: 'pending', weight: 20 }
    ]);

    // 6. Requests
    await supabase.from('operational_requests').insert([
      { organization_id: v_org_id, lead_id: lead.id, project_id: project.id, type: 'finance', status: 'pending', priority: 'high', title: 'Liberação de Verba - Fundação', description: 'Solicitação de repasse para compra de aço e concreto' },
      { organization_id: v_org_id, lead_id: lead.id, project_id: project.id, type: 'architecture', status: 'in_analysis', priority: 'medium', title: 'Detalhamento de Interiores', description: 'Necessário detalhamento da cozinha gourmet' },
      { organization_id: v_org_id, lead_id: lead.id, project_id: project.id, type: 'purchase', status: 'approved', priority: 'medium', title: 'Compra de Blocos Cerâmicos', description: 'Orçamento aprovado para 5000 milheiros' }
    ]);

    // 7. Finance
    await supabase.from('financial_entries').insert([
      { organization_id: v_org_id, project_id: project.id, lead_id: lead.id, type: 'revenue', category: 'Parcela Obra', description: 'Parcela 01/10 - Cliente Teste', amount: 45000, due_date: new Date().toISOString().split('T')[0], status: 'paid' },
      { organization_id: v_org_id, project_id: project.id, lead_id: lead.id, type: 'expense', category: 'Material de Construção', description: 'Compra de Cimento (50 sacos)', amount: 1850, due_date: new Date().toISOString().split('T')[0], status: 'paid' }
    ]);

    // 8. Cache KPIs
    await supabase.from('organization_kpi_cache').upsert([
      { organization_id: v_org_id, kpi_key: 'engineering_overview', kpi_value: { total_active: 1, avg_progress: 15, projects: [{name: "Obra Alpha", progress: 15, status: "active"}] } },
      { organization_id: v_org_id, kpi_key: 'financial_overview', kpi_value: { ebitda: 38950, revenue: 45000, expense: 6050, roi_overview: 6.4 } }
    ], { onConflict: 'organization_id,kpi_key' });

    return new Response(JSON.stringify({ success: true, message: "Massa de dados criada com sucesso!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
