import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getAsaasBase() {
  const env = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) throw new Error('ASAAS_API_KEY not configured');
  const resp = await fetch(`${getAsaasBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', access_token: apiKey, ...(init.headers || {}) },
  });
  const text = await resp.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!resp.ok) throw new Error(`Asaas ${resp.status}: ${JSON.stringify(json)}`);
  return json;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const {
      organization_id, checkout_token, billing_type, // PIX | CREDIT_CARD | BOLETO
      // Card data (required for CREDIT_CARD)
      holder_name, card_number, expiry_month, expiry_year, ccv,
      // Holder info
      holder_email, holder_cpf_cnpj, holder_postal_code, holder_address_number, holder_phone,
      remote_ip,
    } = body;

    if (!billing_type || !['PIX', 'CREDIT_CARD', 'BOLETO'].includes(billing_type)) {
      return new Response(JSON.stringify({ error: 'billing_type must be PIX, CREDIT_CARD or BOLETO' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve org
    let orgQuery = supabase.from('organizations').select('*');
    if (organization_id) orgQuery = orgQuery.eq('id', organization_id);
    else if (checkout_token) orgQuery = orgQuery.eq('checkout_token', checkout_token);
    else throw new Error('organization_id or checkout_token required');

    const { data: org, error: orgErr } = await orgQuery.maybeSingle();
    if (orgErr || !org) throw new Error('Organization not found');

    // Get plan
    let plan: any = null;
    if (org.plan_id) {
      const { data } = await supabase.from('admin_subscription_plans')
        .select('*').eq('id', org.plan_id).maybeSingle();
      plan = data;
    }
    if (!plan) throw new Error('No plan selected for this organization');

    const value = org.subscription_value && Number(org.subscription_value) > 0 
      ? Number(org.subscription_value) 
      : Number(plan.price);
    const isMonthly = (plan.billing_cycle || 'monthly') === 'monthly';

    // Ensure Asaas customer
    let asaasCustomerId = org.asaas_customer_id as string | null;
    if (!asaasCustomerId) {
      const customerPayload: any = {
        name: org.name,
        email: holder_email || org.email,
      };
      if (holder_cpf_cnpj) customerPayload.cpfCnpj = holder_cpf_cnpj.replace(/\D/g, '');
      if (holder_phone) customerPayload.mobilePhone = holder_phone.replace(/\D/g, '');
      const cust = await asaasFetch('/customers', { method: 'POST', body: JSON.stringify(customerPayload) });
      asaasCustomerId = cust.id;
      await supabase.from('organizations').update({ asaas_customer_id: asaasCustomerId }).eq('id', org.id);
    }

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = tomorrow.toISOString().slice(0, 10);

    let result: any;

    if (billing_type === 'PIX' || billing_type === 'BOLETO') {
      // One-time charge
      const payment = await asaasFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: billing_type,
          value,
          dueDate,
          description: `Vimob - ${plan.name}`,
          externalReference: org.id,
        }),
      });

      await supabase.from('asaas_payments').upsert({
        organization_id: org.id,
        asaas_payment_id: payment.id,
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: payment.subscription || null,
        status: payment.status,
        billing_type: payment.billingType || billing_type,
        value: payment.value || value,
        net_value: payment.netValue || null,
        due_date: payment.dueDate || dueDate,
        payment_date: payment.paymentDate || payment.clientPaymentDate || null,
        invoice_url: payment.invoiceUrl || null,
        raw_event: { source: 'asaas-create-charge', payment },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'asaas_payment_id' });

      if (billing_type === 'PIX') {
        const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`);
        result = {
          type: 'PIX',
          payment_id: payment.id,
          invoice_url: payment.invoiceUrl,
          qr_code: qr.encodedImage, // base64 png
          qr_payload: qr.payload,
          expires_at: qr.expirationDate,
          value,
        };
      } else {
        result = {
          type: 'BOLETO',
          payment_id: payment.id,
          invoice_url: payment.invoiceUrl,
          bank_slip_url: payment.bankSlipUrl,
          identification_field: payment.identificationField,
          nosso_numero: payment.nossoNumero,
          value,
        };
      }
    } else {
      // CREDIT_CARD recurring subscription
      if (!card_number || !holder_name || !expiry_month || !expiry_year || !ccv) {
        throw new Error('Card data required for CREDIT_CARD');
      }
      if (!holder_email || !holder_cpf_cnpj || !holder_postal_code || !holder_address_number || !holder_phone) {
        throw new Error('Holder info required (email, cpfCnpj, postalCode, addressNumber, phone)');
      }

      const subPayload: any = {
        customer: asaasCustomerId,
        billingType: 'CREDIT_CARD',
        value,
        nextDueDate: dueDate,
        cycle: isMonthly ? 'MONTHLY' : 'YEARLY',
        description: `Vimob - ${plan.name}`,
        externalReference: org.id,
        creditCard: {
          holderName: holder_name,
          number: card_number.replace(/\s/g, ''),
          expiryMonth: String(expiry_month).padStart(2, '0'),
          expiryYear: String(expiry_year),
          ccv,
        },
        creditCardHolderInfo: {
          name: holder_name,
          email: holder_email,
          cpfCnpj: holder_cpf_cnpj.replace(/\D/g, ''),
          postalCode: holder_postal_code.replace(/\D/g, ''),
          addressNumber: holder_address_number,
          phone: holder_phone.replace(/\D/g, ''),
        },
        remoteIp: remote_ip || req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      };

      const sub = await asaasFetch('/subscriptions', { method: 'POST', body: JSON.stringify(subPayload) });
      await supabase.from('organizations').update({
        asaas_subscription_id: sub.id,
        subscription_status: ['ACTIVE', 'CONFIRMED', 'RECEIVED'].includes(String(sub.status || '').toUpperCase()) ? 'active' : 'pending_payment',
        is_active: ['ACTIVE', 'CONFIRMED', 'RECEIVED'].includes(String(sub.status || '').toUpperCase()),
        next_billing_date: sub.nextDueDate || null,
      }).eq('id', org.id);

      result = {
        type: 'CREDIT_CARD',
        subscription_id: sub.id,
        status: sub.status,
        next_due_date: sub.nextDueDate,
        value,
      };
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('asaas-create-charge:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
