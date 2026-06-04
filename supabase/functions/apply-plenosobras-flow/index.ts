import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const v_org_id = '03a4d0b1-339f-4afa-8424-40f0799d0446';
    
    // Clean up previous attempts if needed
    await supabase.from('pipelines').delete().eq('organization_id', v_org_id).eq('name', 'Fluxo Operacional Obras');

    console.log(`Starting pipeline creation for Org: ${v_org_id}`)

    // 1. Create Pipeline
    const { data: pipeline, error: pError } = await supabase
      .from('pipelines')
      .insert({ organization_id: v_org_id, name: 'Fluxo Operacional Obras' })
      .select()
      .single()

    if (pError) throw pError;
    const v_pipeline_id = pipeline.id;

    const stages = [
      { name: 'Lead Entrou', pos: 1, context: 'comercial', sector: 'SDR', sla: 1, reqs: [{title: "Primeiro Contato", description: "Realizar contato inicial em até 15 minutos", priority: "high", type: "finance"}] },
      { name: 'Tentando Contato', pos: 2, context: 'comercial', sector: 'SDR' },
      { name: 'Em Atendimento', pos: 3, context: 'comercial', sector: 'SDR', checklist: [{task: "Nome do Cliente", required: true}, {task: "CPF do Cliente", required: true}, {task: "Renda Declarada", required: true}, {task: "Interesse Principal", required: true}] },
      { name: 'Não Qualificado', pos: 4, context: 'comercial', sector: 'SDR' },
      { name: 'Qualificado', pos: 5, context: 'comercial', sector: 'SDR' },
      { name: 'Distribuição', pos: 6, context: 'comercial', sector: 'ADM' },
      { name: 'Lead Recebido', pos: 7, context: 'comercial', sector: 'Closer' },
      { name: 'Diagnóstico', pos: 8, context: 'comercial', sector: 'Closer' },
      { name: 'Apresentação Solução', pos: 9, context: 'comercial', sector: 'Closer' },
      { name: 'Proposta Enviada', pos: 10, context: 'comercial', sector: 'Closer' },
      { name: 'Negociação', pos: 11, context: 'comercial', sector: 'Closer' },
      { name: 'Fechado', pos: 12, context: 'financeiro', sector: 'Financeiro', sla: 48, reqs: [{title: "Análise Financeira", description: "Iniciar análise de crédito do cliente", priority: "high", type: "finance"}], checklist: [{task: "Documentação recebida", required: true}, {task: "Cadastro inicial no ERP", required: true}] },
      { name: 'Análise Documentação', pos: 13, context: 'financeiro', sector: 'Financeiro' },
      { name: 'Cadastro Caixa', pos: 14, context: 'financeiro', sector: 'Financeiro' },
      { name: 'Aprovação Crédito', pos: 15, context: 'financeiro', sector: 'Financeiro' },
      { name: 'Escolha Terreno', pos: 16, context: 'engenharia', sector: 'Engenharia' },
      { name: 'Documentação Imóvel', pos: 17, context: 'administrativo', sector: 'ADM' },
      { name: 'Solicitação Vistoria', pos: 18, context: 'engenharia', sector: 'ADM' },
      { name: 'Entrevista Caixa', pos: 19, context: 'financeiro', sector: 'ADM' },
      { name: 'Assinatura Formulários', pos: 20, context: 'administrativo', sector: 'ADM' },
      { name: 'Inclusão Documentos', pos: 21, context: 'administrativo', sector: 'ADM' },
      { name: 'Preenchimento CIOP', pos: 22, context: 'administrativo', sector: 'ADM' },
      { name: 'Envio Conformidade', pos: 23, context: 'administrativo', sector: 'ADM' },
      { name: 'Assinatura Contrato', pos: 24, context: 'administrativo', sector: 'ADM', reqs: [{title: "Kick-off Arquitetura", type: "architecture"}, {title: "Kick-off Engenharia", type: "engineering"}, {title: "Kick-off Compras", type: "purchase"}] }
    ];

    for (const s of stages) {
      const stage_key = s.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const { data: stage, error: sError } = await supabase
        .from('stages')
        .insert({ 
          pipeline_id: v_pipeline_id, 
          name: s.name, 
          position: s.pos,
          stage_key: stage_key
        })
        .select()
        .single()

      if (sError) throw sError;

      if (s.context) {
        const { error: cError } = await supabase
          .from('stage_operational_configs')
          .insert({
            organization_id: v_org_id,
            stage_id: stage.id,
            operation_context: s.context,
            responsible_sector: s.sector,
            sla_hours: s.sla || null,
            automatic_operational_requests: s.reqs || [],
            checklist_template: s.checklist || []
          })
        
        if (cError) throw cError;
      }
    }

    return new Response(JSON.stringify({ success: true, pipeline_id: v_pipeline_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
