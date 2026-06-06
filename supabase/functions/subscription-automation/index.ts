import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(today.getDate() + 5);
    const fiveDaysStr = fiveDaysFromNow.toISOString().split('T')[0];
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(today.getDate() + 2);
    const twoDaysStr = twoDaysFromNow.toISOString().split('T')[0];

    console.log(`Running subscription automation for dates: Today=${todayStr}, BillingWarning=${fiveDaysStr}, TrialWarning=${twoDaysStr}`);

    // 1. Send warnings for subscriptions expiring in 5 days
    const { data: warningOrgs } = await supabase
      .from('organizations')
      .select('*, admin_subscription_plans(*)')
      .eq('next_billing_date', fiveDaysStr)
      .eq('subscription_status', 'active');

    if (warningOrgs) {
      for (const org of warningOrgs) {
        console.log(`Sending 5-day warning to org: ${org.name}`);
        // Here we would trigger the notification. 
        // For now, as per request: "não notifica ninguém ainda, só até a gente dar o ok"
        // We'll just log it.
      }
    }

    // 1b. Warn trial accounts two days before the trial ends
    const { data: trialWarningOrgs } = await supabase
      .from('organizations')
      .select('id, name, trial_ends_at')
      .eq('subscription_status', 'trial')
      .gte('trial_ends_at', `${twoDaysStr}T00:00:00.000Z`)
      .lt('trial_ends_at', `${twoDaysStr}T23:59:59.999Z`);

    if (trialWarningOrgs) {
      for (const org of trialWarningOrgs) {
        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', org.id)
          .eq('role', 'admin')
          .eq('is_active', true);

        const notifications = (admins || []).map((admin: any) => ({
          user_id: admin.id,
          organization_id: org.id,
          title: 'Seu teste termina em 2 dias',
          content: 'Entre em Faturamento para confirmar o pagamento e manter o acesso ativo ao Vimob.',
          type: 'billing',
        }));

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }
    }

    // 1c. Block expired trials by moving them to pending_payment
    const { data: expiredTrials } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('subscription_status', 'trial')
      .lt('trial_ends_at', today.toISOString());

    if (expiredTrials) {
      for (const org of expiredTrials) {
        await supabase
          .from('organizations')
          .update({ subscription_status: 'pending_payment', subscription_type: 'paid' })
          .eq('id', org.id);

        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', org.id)
          .eq('role', 'admin')
          .eq('is_active', true);

        const notifications = (admins || []).map((admin: any) => ({
          user_id: admin.id,
          organization_id: org.id,
          title: 'Periodo de teste encerrado',
          content: 'Seu acesso esta pendente de pagamento. Regularize em Faturamento para continuar usando o Vimob.',
          type: 'billing',
        }));

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }
    }

    // 2. Process billings for today
    const { data: dueOrgs } = await supabase
      .from('organizations')
      .select('*, admin_subscription_plans(*)')
      .eq('next_billing_date', todayStr)
      .neq('subscription_status', 'suspended');

    if (dueOrgs) {
      for (const org of dueOrgs) {
        console.log(`Processing billing for org: ${org.name}`);
        
        // If it's a credit card subscription, Asaas handles it automatically if created as subscription.
        // If it's PIX/Boleto or a manual plan, we need to generate the next charge.
        
        // Update next billing date to next month
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        await supabase
          .from('organizations')
          .update({ 
            next_billing_date: nextMonth.toISOString().split('T')[0]
          })
          .eq('id', org.id);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: dueOrgs?.length || 0,
      trial_warnings: trialWarningOrgs?.length || 0,
      expired_trials: expiredTrials?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in subscription-automation:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
