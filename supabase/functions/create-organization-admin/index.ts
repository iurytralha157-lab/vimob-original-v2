import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Verify the caller is authenticated using getClaims
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Create client with user's auth to verify token
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('Claims error:', claimsError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const callerUserId = claimsData.claims.sub as string;
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if caller is super admin
    const { data: superAdminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'super_admin')
      .single();

    if (!superAdminRole) {
      return new Response(JSON.stringify({ error: 'Not a super admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      name, 
      segment = 'imobiliario', 
      adminEmail, 
      adminName, 
      adminPassword, 
      whatsapp, 
      phone,
      cnpj,
      creci,
      planId,
      address,
      city,
      neighborhood,
      number,
      complement,
      cpf
    } = await req.json();

    if (!name || !adminEmail || !adminName || !adminPassword) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate segment
    const validSegments = ['imobiliario', 'telecom', 'servicos', 'engenharia'];
    if (!validSegments.includes(segment)) {
      return new Response(JSON.stringify({ error: 'Invalid segment' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let plan: any = null;
    if (planId) {
      const { data: selectedPlan, error: planError } = await supabaseAdmin
        .from('admin_subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .maybeSingle();

      if (planError) throw planError;
      if (!selectedPlan) {
        return new Response(JSON.stringify({ error: 'Plano selecionado nÃ£o encontrado ou inativo' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      plan = selectedPlan;
    }

    const trialDays = Number(plan?.trial_days || 0);
    const hasTrial = Boolean(plan?.trial_enabled) && trialDays > 0;
    const trialEndsAt = hasTrial
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // 1. Create the organization with segment
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name,
        segment,
        plan_id: plan?.id || null,
        max_users: Number(plan?.max_users || 10),
        subscription_value: Number(plan?.price || 0),
        subscription_status: plan ? (hasTrial ? 'trial' : 'pending_payment') : 'trial',
        subscription_type: plan ? (hasTrial ? 'trial' : plan.billing_cycle || 'monthly') : 'trial',
        trial_ends_at: trialEndsAt,
        whatsapp: whatsapp || null,
        cnpj: cnpj || null,
        creci: creci || null,
        endereco: address || null,
        cidade: city || null,
        bairro: neighborhood || null,
        numero: number || null,
        complemento: complement || null,
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
      return new Response(JSON.stringify({ error: orgError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name: adminName,
      },
    });

    if (authError) {
      // Rollback: delete the organization
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      console.error('Error creating auth user:', authError);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Update user profile in users table (trigger already created the user)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        name: adminName,
        role: 'admin',
        organization_id: org.id,
        is_active: true,
        whatsapp: whatsapp || phone || null,
        phone: phone || null,
        cpf: cpf || null,
      }, { onConflict: 'id' })
      .eq('id', authData.user.id);

    if (userError) {
      // Rollback: delete auth user and organization
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      console.error('Error updating user profile:', userError);
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3b. Add admin role to user_roles table
    await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: authData.user.id,
        role: 'admin',
      }, { onConflict: 'user_id,role' });

    // 4. Create modules based on selected plan, falling back to segment defaults
    const allKnownModules = [
      'crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'financial', 'whatsapp',
      'properties', 'plans', 'coverage', 'telecom', 'agenda', 'cadences', 'tags',
      'round_robin', 'reports', 'automations', 'performance', 'gamification',
      'webhooks', 'site', 'ai_agent', 'campaigns', 'engineering', 'api'
    ];
    let fallbackModules: string[] = [];

    if (segment === 'telecom') {
      fallbackModules = ['crm', 'financial', 'whatsapp', 'agenda', 'plans', 'coverage', 'telecom', 'tags', 'round_robin', 'reports'];
    } else if (segment === 'imobiliario') {
      fallbackModules = ['crm', 'financial', 'properties', 'whatsapp', 'agenda', 'cadences', 'tags', 'round_robin', 'reports'];
    } else if (segment === 'engenharia') {
      fallbackModules = ['crm', 'financial', 'engineering', 'whatsapp', 'agenda', 'tags', 'round_robin', 'reports'];
    } else {
      fallbackModules = ['crm', 'financial', 'whatsapp', 'agenda', 'tags', 'round_robin', 'reports'];
    }

    const planModules = Array.isArray(plan?.modules) ? plan.modules : [];
    const enabledModules = Array.from(new Set((planModules.length ? planModules : fallbackModules) as string[]));
    const disabledModules = allKnownModules.filter(module => !enabledModules.includes(module));

    const allModuleRecords = [
      ...enabledModules.map(module => ({
        organization_id: org.id,
        module_name: module,
        is_enabled: true,
      })),
      ...disabledModules.map(module => ({
        organization_id: org.id,
        module_name: module,
        is_enabled: false,
      })),
    ];

    await supabaseAdmin
      .from('organization_modules')
      .insert(allModuleRecords);

    // 5. Create default pipeline for the organization based on segment
    const pipelineName = segment === 'telecom' ? 'Pipeline Telecom' : 'Pipeline Principal';
    const { data: pipeline } = await supabaseAdmin
      .from('pipelines')
      .insert({
        organization_id: org.id,
        name: pipelineName,
        is_default: true, // IMPORTANT: Always set default pipeline
      })
      .select()
      .single();

    if (pipeline) {
      // Create stages based on segment
      let stages;
      if (segment === 'telecom') {
        stages = [
          { name: 'Novo', stage_key: 'novo', color: '#3B82F6', position: 0 },
          { name: 'Análise Viabilidade', stage_key: 'viabilidade', color: '#F59E0B', position: 1 },
          { name: 'Agendado', stage_key: 'agendado', color: '#8B5CF6', position: 2 },
          { name: 'Instalação', stage_key: 'instalacao', color: '#EC4899', position: 3 },
          { name: 'Ativado', stage_key: 'ativado', color: '#10B981', position: 4 },
        ];
      } else if (segment === 'engenharia') {
        stages = [
          { name: 'Novo Orçamento', stage_key: 'novo', color: '#3B82F6', position: 0 },
          { name: 'Visita Técnica', stage_key: 'visita', color: '#F59E0B', position: 1 },
          { name: 'Em Elaboração', stage_key: 'elaboracao', color: '#8B5CF6', position: 2 },
          { name: 'Proposta Enviada', stage_key: 'proposta', color: '#EC4899', position: 3 },
          { name: 'Obra Iniciada', stage_key: 'obra', color: '#10B981', position: 4 },
        ];
      } else {
        stages = [
          { name: 'Novo', stage_key: 'novo', color: '#3B82F6', position: 0 },
          { name: 'Qualificação', stage_key: 'qualificacao', color: '#F59E0B', position: 1 },
          { name: 'Proposta', stage_key: 'proposta', color: '#8B5CF6', position: 2 },
          { name: 'Negociação', stage_key: 'negociacao', color: '#EC4899', position: 3 },
          { name: 'Fechado', stage_key: 'fechado', color: '#10B981', position: 4 },
        ];
      }

      await supabaseAdmin
        .from('stages')
        .insert(stages.map(stage => ({
          ...stage,
          pipeline_id: pipeline.id,
        })));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      organization: org,
      user: {
        id: authData.user.id,
        email: adminEmail,
        name: adminName,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
