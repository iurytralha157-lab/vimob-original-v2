import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getAsaasBase() {
  const env = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';
  return env === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) throw new Error('ASAAS_API_KEY not configured');
  const resp = await fetch(`${getAsaasBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!resp.ok) {
    console.error('Asaas error', resp.status, json);
    throw new Error(`Asaas ${resp.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

    const {
      organization_id,
      onboarding_id,
      plan_name,
      value,
      billing_cycle,
      customer_name,
      customer_email,
      customer_phone,
      customer_cpf_cnpj,
      temp_password,
    } = await req.json();

    if (!organization_id || !value || !customer_name || !customer_email) {
      return new Response(JSON.stringify({ error: 'organization_id, value, customer_name, customer_email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Create or get Asaas customer
    const cleanDoc = (customer_cpf_cnpj || '').replace(/\D/g, '');
    const cleanPhone = (customer_phone || '').replace(/\D/g, '');

    const customerPayload: any = {
      name: customer_name,
      email: customer_email,
    };
    if (cleanDoc) customerPayload.cpfCnpj = cleanDoc;
    if (cleanPhone) customerPayload.mobilePhone = cleanPhone;

    const customer = await asaasFetch('/customers', {
      method: 'POST',
      body: JSON.stringify(customerPayload),
    });
    console.log('Asaas customer created:', customer.id);

    // 2. Create payment link
    const isAnnual = billing_cycle === 'yearly' || billing_cycle === 'annual';
    const linkPayload: any = {
      name: `${plan_name || 'Assinatura Vimob'}${isAnnual ? ' (Anual)' : ' (Mensal)'}`,
      description: `Plano ${plan_name || 'Vimob'} — ${customer_name}`,
      billingType: 'UNDEFINED', // customer chooses (Pix / Card / Boleto)
      chargeType: isAnnual ? 'DETACHED' : 'RECURRENT',
      value: Number(value),
      dueDateLimitDays: 7,
      maxInstallmentCount: isAnnual ? 12 : 1,
      notificationEnabled: true,
    };
    if (!isAnnual) {
      linkPayload.subscriptionCycle = 'MONTHLY';
    }

    const link = await asaasFetch('/paymentLinks', {
      method: 'POST',
      body: JSON.stringify(linkPayload),
    });
    console.log('Asaas payment link created:', link.id, link.url);

    // 3. Persist on organization
    await supabase.from('organizations').update({
      asaas_customer_id: customer.id,
      asaas_payment_link_id: link.id,
      asaas_payment_link_url: link.url,
    }).eq('id', organization_id);

    // 4. Send WhatsApp to client
    if (cleanPhone && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global')
        .maybeSingle();
      const instanceName = ((settings?.value || {}) as any).notification_instance_name as string | undefined;

      if (instanceName) {
        const formattedValue = Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const message =
`✅ *Olá ${customer_name}!*

Sua conta no *Vimob* foi ativada com sucesso! 🎉

🔐 *Dados de acesso:*
🌐 https://vimob.vettercompany.com.br/auth
✉️ Email: ${customer_email}
🔑 Senha temporária: ${temp_password || '(enviada por email)'}

💳 *Plano:* ${plan_name || 'Vimob'} — ${formattedValue}

Para liberar o acesso completo, finalize o pagamento no link abaixo:
👉 ${link.url}

Você pode pagar via *Pix (QR Code)*, *Cartão de Crédito${isAnnual ? ' (parcelado em até 12x)' : ' recorrente'}* ou *Boleto*.

Qualquer dúvida, estamos à disposição! 💬`;

        const sendResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: cleanPhone, text: message }),
        });
        console.log('Welcome WhatsApp sent:', sendResp.status);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      asaas_customer_id: customer.id,
      payment_link_id: link.id,
      payment_link_url: link.url,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('asaas-create-payment-link error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
