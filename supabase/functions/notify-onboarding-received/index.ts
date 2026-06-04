import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { onboarding_id } = await req.json();
    if (!onboarding_id) {
      return new Response(JSON.stringify({ error: 'onboarding_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: ob, error: obErr } = await supabase
      .from('onboarding_requests')
      .select('company_name, responsible_name, responsible_email, responsible_phone')
      .eq('id', onboarding_id)
      .single();

    if (obErr || !ob) {
      return new Response(JSON.stringify({ error: 'Onboarding not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'global')
      .maybeSingle();

    const adminWhatsapp = ((settings?.value || {}) as Record<string, any>).default_whatsapp as string | undefined;
    if (!adminWhatsapp) {
      console.log('Missing admin whatsapp notification config');
      return new Response(JSON.stringify({ success: false, skipped: 'config missing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminUrl = 'https://vimob.vettercompany.com.br/admin/onboarding';
    const message =
`Novo cadastro no Onboard

Empresa: ${ob.company_name}
Responsavel: ${ob.responsible_name}
Email: ${ob.responsible_email}
Telefone: ${ob.responsible_phone || '-'}

Acesse e aprove:
${adminUrl}`;

    const resp = await sendWhatsAppNotification(SUPABASE_URL, SERVICE_KEY, {
      phone: adminWhatsapp,
      message,
    });
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    console.log('notify-onboarding-received', { status: resp.status, ok: resp.ok });

    return new Response(JSON.stringify({ success: resp.ok, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-onboarding-received error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
