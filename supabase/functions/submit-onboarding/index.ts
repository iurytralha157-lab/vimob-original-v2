import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allKnownModules = [
  'crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'financial', 'whatsapp',
  'properties', 'plans', 'coverage', 'telecom', 'agenda', 'cadences', 'tags',
  'round_robin', 'reports', 'automations', 'performance', 'gamification',
  'webhooks', 'site', 'ai_agent', 'campaigns', 'engineering', 'api',
];

const defaultModulesBySegment: Record<string, string[]> = {
  telecom: ['crm', 'financial', 'whatsapp', 'agenda', 'plans', 'coverage', 'telecom', 'tags', 'round_robin', 'reports'],
  imobiliario: ['crm', 'financial', 'properties', 'whatsapp', 'agenda', 'cadences', 'tags', 'round_robin', 'reports', 'site'],
  engenharia: ['crm', 'financial', 'engineering', 'whatsapp', 'agenda', 'tags', 'round_robin', 'reports'],
  servicos: ['crm', 'financial', 'whatsapp', 'agenda', 'tags', 'round_robin', 'reports'],
};

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function onlyDigits(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function cleanFallbackPlanId(planId: string | null | undefined) {
  if (!planId || planId.endsWith('-fallback')) return null;
  return planId;
}

function generatedPassword() {
  return `${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}A1!`;
}

async function resolvePlan(supabaseAdmin: any, body: any) {
  const planId = cleanFallbackPlanId(body.selected_plan_id);
  if (planId) {
    const { data, error } = await supabaseAdmin
      .from('admin_subscription_plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const selectedName = String(body.selected_plan_name || '').toLowerCase();
  const preferredName = selectedName.includes('master') ? 'Master' : 'Enterprise';
  const { data: planByName, error: nameError } = await supabaseAdmin
    .from('admin_subscription_plans')
    .select('*')
    .eq('name', preferredName)
    .eq('is_active', true)
    .maybeSingle();

  if (nameError) throw nameError;
  if (planByName) return planByName;

  return {
    id: null,
    name: preferredName,
    price: preferredName === 'Master' ? 497 : 197,
    billing_cycle: 'monthly',
    trial_enabled: preferredName !== 'Master',
    trial_days: preferredName === 'Master' ? 0 : 7,
    max_users: preferredName === 'Master' ? 50 : 15,
    max_whatsapp_sessions: preferredName === 'Master' ? 5 : 1,
    modules: preferredName === 'Master'
      ? ['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'automations', 'whatsapp', 'financial', 'properties', 'agenda', 'reports', 'site', 'ai_agent', 'campaigns']
      : ['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'whatsapp', 'properties', 'agenda', 'reports', 'site'],
  };
}

async function getAuthenticatedUserId(supabaseUrl: string, anonKey: string | undefined, authHeader: string | null) {
  if (!anonKey || !authHeader?.startsWith('Bearer ')) return null;

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function createInitialPipeline(supabaseAdmin: any, organizationId: string, segment: string) {
  const pipelineName = segment === 'telecom' ? 'Pipeline Telecom' : 'Pipeline Principal';
  const { data: pipeline, error } = await supabaseAdmin
    .from('pipelines')
    .insert({ organization_id: organizationId, name: pipelineName, is_default: true })
    .select()
    .single();

  if (error || !pipeline) {
    console.error('Failed to create initial pipeline:', error);
    return;
  }

  const stages = segment === 'telecom'
    ? [
        { name: 'Novo', stage_key: 'novo', color: '#3B82F6', position: 0 },
        { name: 'Analise Viabilidade', stage_key: 'viabilidade', color: '#F59E0B', position: 1 },
        { name: 'Agendado', stage_key: 'agendado', color: '#8B5CF6', position: 2 },
        { name: 'Instalacao', stage_key: 'instalacao', color: '#EC4899', position: 3 },
        { name: 'Ativado', stage_key: 'ativado', color: '#10B981', position: 4 },
      ]
    : [
        { name: 'Novo', stage_key: 'novo', color: '#3B82F6', position: 0 },
        { name: 'Qualificacao', stage_key: 'qualificacao', color: '#F59E0B', position: 1 },
        { name: 'Proposta', stage_key: 'proposta', color: '#8B5CF6', position: 2 },
        { name: 'Negociacao', stage_key: 'negociacao', color: '#EC4899', position: 3 },
        { name: 'Fechado', stage_key: 'fechado', color: '#10B981', position: 4 },
        { name: 'Perdido', stage_key: 'perdido', color: '#EF4444', position: 5 },
      ];

  const { error: stagesError } = await supabaseAdmin
    .from('stages')
    .insert(stages.map((stage) => ({
      ...stage,
      pipeline_id: pipeline.id,
      organization_id: organizationId,
      is_won: ['ativado', 'fechado'].includes(stage.stage_key),
      is_lost: stage.stage_key === 'perdido',
    })));

  if (stagesError) console.error('Failed to create initial stages:', stagesError);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const {
      company_name, cnpj, company_address, company_city, company_neighborhood,
      company_number, company_complement, company_phone, company_whatsapp, company_email,
      segment = 'imobiliario', responsible_name, responsible_email, responsible_cpf, responsible_phone,
      creci, logo_url, favicon_url, primary_color, secondary_color,
      site_title, custom_domain, instagram, facebook, youtube, linkedin,
      privacy_policy_accepted, terms_accepted, privacy_policy_version, terms_version, legal_accepted_at,
    } = body;

    const email = normalizeEmail(responsible_email);
    const responsiblePhoneDigits = onlyDigits(responsible_phone);
    if (!company_name || !responsible_name || !email || responsiblePhoneDigits.length < 10) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios: nome da empresa, nome, email e WhatsApp do responsavel' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!privacy_policy_accepted || !terms_accepted) {
      return new Response(JSON.stringify({ error: 'Aceite a Politica de Privacidade e os Termos de Uso para continuar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plan = await resolvePlan(supabaseAdmin, body);
    const planPrice = Number(body.confirmed_value || plan.price || 0);
    const trialDays = Number(plan.trial_days || 0);
    const hasTrial = Boolean(plan.trial_enabled) && trialDays > 0;
    const requiresPayment = !hasTrial && planPrice > 0;
    const trialEndsAt = hasTrial ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null;
    const nextBillingDate = hasTrial
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;

    const authenticatedUserId = await getAuthenticatedUserId(supabaseUrl, anonKey, authHeader);
    const tempPassword = generatedPassword();
    let userId = authenticatedUserId;
    let createdAuthUser = false;

    if (!userId) {
      const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
        .from('users')
        .select('id, organization_id')
        .eq('email', email)
        .maybeSingle();

      if (existingProfileError) throw existingProfileError;
      if (existingProfile?.organization_id) {
        return new Response(JSON.stringify({ error: 'Este e-mail ja possui uma organizacao ativa. Faca login para acessar.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (existingProfile?.id) {
        const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(existingProfile.id);
        if (authUserData?.user?.id) {
          userId = existingProfile.id;
        } else {
          const { error: deleteOrphanError } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', existingProfile.id)
            .is('organization_id', null);

          if (deleteOrphanError) throw deleteOrphanError;
        }
      }

      if (!userId) {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name: responsible_name },
        });

        if (authError) throw authError;
        userId = authData.user.id;
        createdAuthUser = true;
      }
    }

    const { data: existingUserOrg } = await supabaseAdmin
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();

    if (existingUserOrg?.organization_id) {
      return new Response(JSON.stringify({ error: 'Seu usuario ja esta vinculado a uma organizacao.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: onboardingRequest, error: requestError } = await supabaseAdmin
      .from('onboarding_requests')
      .insert({
        user_id: userId,
        company_name,
        cnpj: cnpj || null,
        creci: creci || null,
        company_address: company_address || null,
        company_city: company_city || null,
        company_neighborhood: company_neighborhood || null,
        company_number: company_number || null,
        company_complement: company_complement || null,
        company_phone: company_phone || null,
        company_whatsapp: company_whatsapp || null,
        company_email: company_email || null,
        segment,
        responsible_name,
        responsible_email: email,
        responsible_cpf: responsible_cpf || null,
        responsible_phone: responsible_phone || null,
        logo_url: logo_url || null,
        favicon_url: favicon_url || null,
        primary_color: primary_color || '#3b82f6',
        secondary_color: secondary_color || null,
        site_title: site_title || null,
        custom_domain: custom_domain || null,
        instagram: instagram || null,
        facebook: facebook || null,
        youtube: youtube || null,
        linkedin: linkedin || null,
        selected_plan_id: plan.id || null,
        confirmed_value: planPrice,
        billing_cycle: plan.billing_cycle || 'monthly',
        privacy_policy_accepted: true,
        terms_accepted: true,
        privacy_policy_version: privacy_policy_version || '2026-06-06',
        terms_version: terms_version || '2026-06-06',
        legal_accepted_at: legal_accepted_at || new Date().toISOString(),
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .select()
      .single();

    if (requestError) {
      if (createdAuthUser) await supabaseAdmin.auth.admin.deleteUser(userId);
      throw requestError;
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: company_name,
        segment,
        plan_id: plan.id || null,
        max_users: Number(plan.max_users || 10),
        subscription_value: planPrice,
        subscription_status: hasTrial ? 'trial' : 'pending_payment',
        subscription_type: hasTrial ? 'trial' : 'paid',
        trial_ends_at: trialEndsAt,
        next_billing_date: nextBillingDate,
        logo_url: logo_url || null,
        accent_color: primary_color || '#3b82f6',
        whatsapp: company_whatsapp || responsible_phone || null,
        telefone: company_phone || null,
        email: company_email || email,
        website: custom_domain || null,
        cnpj: cnpj || null,
        creci: creci || null,
        endereco: company_address || null,
        cidade: company_city || null,
        bairro: company_neighborhood || null,
        numero: company_number || null,
        complemento: company_complement || null,
      })
      .select()
      .single();

    if (orgError) {
      await supabaseAdmin.from('onboarding_requests').delete().eq('id', onboardingRequest.id);
      if (createdAuthUser) await supabaseAdmin.auth.admin.deleteUser(userId);
      throw orgError;
    }

    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        name: responsible_name,
        email,
        role: 'admin',
        organization_id: org.id,
        is_active: true,
        whatsapp: responsible_phone || company_whatsapp || null,
        phone: responsible_phone || null,
        cpf: responsible_cpf || null,
      }, { onConflict: 'id' });

    if (userError) throw userError;

    await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role: 'admin' },
      { onConflict: 'user_id,role' },
    );

    const planModules = Array.isArray(plan.modules) ? plan.modules : [];
    const fallbackModules = defaultModulesBySegment[segment] || defaultModulesBySegment.imobiliario;
    const enabledModules = Array.from(new Set((planModules.length ? planModules : fallbackModules) as string[]));
    const disabledModules = allKnownModules.filter((module) => !enabledModules.includes(module));

    const moduleRows = [
      ...enabledModules.map((moduleName) => ({ organization_id: org.id, module_name: moduleName, is_enabled: true })),
      ...disabledModules.map((moduleName) => ({ organization_id: org.id, module_name: moduleName, is_enabled: false })),
    ];

    const { error: modulesError } = await supabaseAdmin.from('organization_modules').insert(moduleRows);
    if (modulesError) console.error('Failed to sync organization modules:', modulesError);

    await createInitialPipeline(supabaseAdmin, org.id, segment);

    let paymentUrl: string | undefined;
    if (requiresPayment) {
      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.functions.invoke('asaas-create-payment-link', {
          body: {
            organization_id: org.id,
            onboarding_id: onboardingRequest.id,
            plan_name: plan.name || 'Vimob',
            value: planPrice,
            billing_cycle: plan.billing_cycle || 'monthly',
            customer_name: responsible_name,
            customer_email: email,
            customer_phone: responsible_phone || company_whatsapp || company_phone,
            customer_cpf_cnpj: responsible_cpf || cnpj,
            temp_password: createdAuthUser ? tempPassword : undefined,
          },
        });

        if (linkError) throw linkError;
        paymentUrl = linkData?.payment_link_url;
      } catch (paymentError) {
        console.error('Failed to create payment link:', paymentError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      id: onboardingRequest.id,
      organizationId: org.id,
      plan: { id: plan.id, name: plan.name, price: planPrice },
      status: org.subscription_status,
      requires_payment: requiresPayment,
      paymentUrl,
      email,
      temp_password: createdAuthUser ? tempPassword : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
