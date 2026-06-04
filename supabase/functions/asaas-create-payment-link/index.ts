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
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    console.error('Asaas error', resp.status, json);
    throw new Error(`Asaas ${resp.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

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

    const {
      organization_id,
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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

    const isAnnual = billing_cycle === 'yearly' || billing_cycle === 'annual';
    const linkPayload: any = {
      name: `${plan_name || 'Assinatura Vimob'}${isAnnual ? ' (Anual)' : ' (Mensal)'}`,
      description: `Plano ${plan_name || 'Vimob'} - ${customer_name}`,
      billingType: 'UNDEFINED',
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

    await supabase.from('organizations').update({
      asaas_customer_id: customer.id,
      asaas_payment_link_id: link.id,
      asaas_payment_link_url: link.url,
    }).eq('id', organization_id);

    if (cleanPhone) {
      const formattedValue = Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const message =
`Ola ${customer_name}!

Sua conta no Vimob foi ativada com sucesso.

Dados de acesso:
https://vimob.vettercompany.com.br/auth
Email: ${customer_email}
Senha temporaria: ${temp_password || '(enviada por email)'}

Plano: ${plan_name || 'Vimob'} - ${formattedValue}

Para liberar o acesso completo, finalize o pagamento no link abaixo:
${link.url}

Voce pode pagar via Pix, cartao de credito${isAnnual ? ' parcelado em ate 12x' : ' recorrente'} ou boleto.

Qualquer duvida, estamos a disposicao.`;

      await sendWhatsAppNotification(SUPABASE_URL, SERVICE_KEY, {
        organization_id,
        phone: cleanPhone,
        message,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      asaas_customer_id: customer.id,
      payment_link_id: link.id,
      payment_link_url: link.url,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('asaas-create-payment-link error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
