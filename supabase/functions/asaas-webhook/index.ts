import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

    // Optional shared-secret validation (set in Asaas + this env var)
    if (WEBHOOK_TOKEN) {
      const incoming = req.headers.get('asaas-access-token');
      if (incoming !== WEBHOOK_TOKEN) {
        console.warn('Asaas webhook: token mismatch');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const event = await req.json();
    console.log('Asaas webhook event:', event.event, event.payment?.id);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const payment = event.payment;
    if (!payment) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find org by asaas_customer_id
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('asaas_customer_id', payment.customer)
      .maybeSingle();

    if (!org) {
      console.warn('No org found for asaas customer', payment.customer);
      return new Response(JSON.stringify({ ok: true, no_org: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert payment record
    await supabase.from('asaas_payments').upsert({
      organization_id: org.id,
      asaas_payment_id: payment.id,
      asaas_customer_id: payment.customer,
      asaas_subscription_id: payment.subscription || null,
      status: payment.status,
      billing_type: payment.billingType,
      value: payment.value,
      net_value: payment.netValue,
      due_date: payment.dueDate,
      payment_date: payment.paymentDate || payment.clientPaymentDate || null,
      invoice_url: payment.invoiceUrl,
      raw_event: event,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'asaas_payment_id' });

    // Activate org on confirmation and update next billing date
    if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      const nextBillingDateStr = nextBillingDate.toISOString().split('T')[0];

      await supabase.from('organizations').update({
        subscription_status: 'active',
        is_active: true,
        next_billing_date: nextBillingDateStr
      }).eq('id', org.id);
      
      console.log('Activated org and updated next billing to', nextBillingDateStr, 'for org', org.id);

      // Notify admin
      if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
        const { data: settings } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'global')
          .maybeSingle();
        const sv = (settings?.value || {}) as any;
        const adminPhone = (sv.default_whatsapp as string | undefined)?.replace(/\D/g, '');
        const inst = sv.notification_instance_name as string | undefined;
        if (adminPhone && inst) {
          const valFmt = Number(payment.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          await fetch(`${EVOLUTION_API_URL}/message/sendText/${inst}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({
              number: adminPhone,
              text: `💰 *Pagamento confirmado*\n\n🏢 ${org.name}\n💵 ${valFmt}\n📌 ${payment.billingType}`,
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('asaas-webhook error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
