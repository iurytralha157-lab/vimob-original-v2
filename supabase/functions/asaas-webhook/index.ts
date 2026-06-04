import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

async function sendWhatsAppNotification(
  supabaseUrl: string,
  serviceKey: string,
  payload: { organization_id?: string; phone: string; message: string },
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-notifier`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn('WhatsApp notification failed:', response.status, text);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

    if (WEBHOOK_TOKEN) {
      const incoming = req.headers.get('asaas-access-token');
      if (incoming !== WEBHOOK_TOKEN) {
        console.warn('Asaas webhook: token mismatch');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const event = await req.json();
    console.log('Asaas webhook event:', event.event, event.payment?.id);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const payment = event.payment;

    if (!payment) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('asaas_customer_id', payment.customer)
      .maybeSingle();

    if (!org) {
      console.warn('No org found for asaas customer', payment.customer);
      return new Response(JSON.stringify({ ok: true, no_org: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      const nextBillingDateStr = nextBillingDate.toISOString().split('T')[0];

      await supabase.from('organizations').update({
        subscription_status: 'active',
        is_active: true,
        next_billing_date: nextBillingDateStr,
      }).eq('id', org.id);

      console.log('Activated org and updated next billing to', nextBillingDateStr, 'for org', org.id);

      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global')
        .maybeSingle();

      const adminPhone = ((settings?.value || {}) as any).default_whatsapp as string | undefined;
      if (adminPhone) {
        const valFmt = Number(payment.value).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });

        await sendWhatsAppNotification(SUPABASE_URL, SERVICE_KEY, {
          phone: adminPhone,
          message: `Pagamento confirmado\n\nEmpresa: ${org.name}\nValor: ${valFmt}\nForma: ${payment.billingType}`,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('asaas-webhook error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
