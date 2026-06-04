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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

    const { onboarding_id } = await req.json();
    if (!onboarding_id) {
      return new Response(JSON.stringify({ error: 'onboarding_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get onboarding info
    const { data: ob, error: obErr } = await supabase
      .from('onboarding_requests')
      .select('company_name, responsible_name, responsible_email, responsible_phone')
      .eq('id', onboarding_id)
      .single();
    if (obErr || !ob) {
      return new Response(JSON.stringify({ error: 'Onboarding not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get system settings (admin whatsapp + notification instance)
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'global')
      .maybeSingle();

    const settingsValue = (settings?.value || {}) as Record<string, any>;
    const adminWhatsapp = settingsValue.default_whatsapp as string | undefined;
    const instanceName = settingsValue.notification_instance_name as string | undefined;

    if (!adminWhatsapp || !instanceName || !EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.log('Missing notification config', { adminWhatsapp: !!adminWhatsapp, instanceName: !!instanceName });
      return new Response(JSON.stringify({ success: false, skipped: 'config missing' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminUrl = `https://vimob.vettercompany.com.br/admin/onboarding`;
    const message =
`🆕 *Novo cadastro no Onboard*

🏢 *Empresa:* ${ob.company_name}
👤 *Responsável:* ${ob.responsible_name}
✉️ *Email:* ${ob.responsible_email}
📱 *Telefone:* ${ob.responsible_phone || '-'}

🔗 Acesse e aprove:
${adminUrl}`;

    const phone = adminWhatsapp.replace(/\D/g, '');

    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, text: message }),
    });
    const data = await resp.json();
    console.log('notify-onboarding-received', { status: resp.status, ok: resp.ok });

    return new Response(JSON.stringify({ success: resp.ok, data }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-onboarding-received error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
