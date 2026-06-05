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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get request body
    const { requestId, planId, confirmedValue, billingCycle, adminNotes } = await req.json();

    if (!requestId || !planId || !confirmedValue) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch the onboarding request
    const { data: onboardingRequest, error: fetchError } = await supabaseAdmin
      .from("onboarding_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !onboardingRequest) {
      return new Response(JSON.stringify({ error: "Onboarding request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (onboardingRequest.status !== "pending") {
      return new Response(JSON.stringify({ error: "Request is already processed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from("admin_subscription_plans")
      .select("id,name,price,billing_cycle,trial_enabled,trial_days,max_users,modules")
      .eq("id", planId)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trialDays = Number(plan.trial_days || 0);
    const hasTrial = Boolean(plan.trial_enabled) && trialDays > 0;
    const trialEndsAt = hasTrial
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // 2. Generate random password
    const generatedPassword = Math.random().toString(36).slice(-10) + "A1!";

    // 3a. Get or Create Auth User
    let userId: string;
    const { data: existingUserQuery, error: userQueryError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", onboardingRequest.responsible_email)
      .maybeSingle();

    if (userQueryError) throw userQueryError;

    if (existingUserQuery) {
      userId = existingUserQuery.id;
      console.log(`User already exists with ID: ${userId}`);
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: onboardingRequest.responsible_email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: {
          name: onboardingRequest.responsible_name,
        },
      });

      if (authError) {
        if (authError.message.includes("already been registered") || (authError as any).code === "email_exists") {
          const { data: retryUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", onboardingRequest.responsible_email)
            .maybeSingle();
          if (retryUser) {
            userId = retryUser.id;
          } else {
            throw authError;
          }
        } else {
          throw authError;
        }
      } else {
        userId = authData.user.id;
      }
    }

    // 3b. Create Organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: onboardingRequest.company_name,
        segment: onboardingRequest.segment || "imobiliario",
        whatsapp: onboardingRequest.company_whatsapp || null,
        cnpj: onboardingRequest.cnpj || null,
        creci: onboardingRequest.creci || null,
        endereco: onboardingRequest.company_address || null,
        cidade: onboardingRequest.company_city || null,
        bairro: onboardingRequest.company_neighborhood || null,
        numero: onboardingRequest.company_number || null,
        complemento: onboardingRequest.company_complement || null,
        plan_id: planId,
        max_users: Number(plan.max_users || 10),
        subscription_value: Number(confirmedValue || plan.price || 0),
        subscription_status: hasTrial ? "trial" : "pending_payment",
        subscription_type: hasTrial ? "trial" : "paid",
        trial_ends_at: trialEndsAt,
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // 3c. Update user profile
    await supabaseAdmin
      .from("users")
      .update({
        name: onboardingRequest.responsible_name,
        role: "admin",
        organization_id: org.id,
        is_active: true,
        whatsapp: onboardingRequest.responsible_phone || onboardingRequest.company_whatsapp || null,
      })
      .eq("id", userId);

    // 3d. Set user role
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin" });

    if (Array.isArray(plan.modules) && plan.modules.length > 0) {
      const moduleRows = plan.modules.map((moduleName: string) => ({
        organization_id: org.id,
        module_name: moduleName,
        is_enabled: true,
      }));

      const { error: moduleError } = await supabaseAdmin
        .from("organization_modules")
        .upsert(moduleRows, { onConflict: "organization_id,module_name" });

      if (moduleError) console.error("Failed to sync plan modules:", moduleError);
    }

    // 4. Update Onboarding Request — usando colunas que existem na tabela
    const { error: updateError } = await supabaseAdmin
      .from("onboarding_requests")
      .update({
        status: "approved",
        admin_notes: adminNotes || null,
        selected_plan_id: planId,
        confirmed_value: Number(confirmedValue),
        billing_cycle: billingCycle || null,
        reviewed_at: new Date().toISOString(), // ✅ corrigido
        reviewed_by: userId, // ✅ corrigido
      })
      .eq("id", requestId);

    if (updateError) throw updateError;

    // 5. Trigger Asaas payment link (opcional)
    let paymentUrl: string | undefined;
    try {
      const { data: linkData } = await supabaseAdmin.functions.invoke("asaas-create-payment-link", {
        body: {
          organization_id: org.id,
          onboarding_id: requestId,
          plan_name: plan.name || "Vimob",
          value: Number(confirmedValue),
          billing_cycle: billingCycle,
          customer_name: onboardingRequest.responsible_name,
          customer_email: onboardingRequest.responsible_email,
          customer_phone: onboardingRequest.responsible_phone || onboardingRequest.company_whatsapp,
          customer_cpf_cnpj: onboardingRequest.responsible_cpf || onboardingRequest.cnpj,
          temp_password: generatedPassword,
        },
      });
      paymentUrl = linkData?.payment_link_url;
    } catch (e) {
      console.error("Failed to create Asaas link:", e);
      // Não lança erro — pagamento é opcional, não bloqueia o fluxo
    }

    // 6. Retorno de sucesso
    return new Response(
      JSON.stringify({
        success: true,
        email: onboardingRequest.responsible_email,
        password: generatedPassword,
        paymentUrl,
        organizationId: org.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error approving request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
