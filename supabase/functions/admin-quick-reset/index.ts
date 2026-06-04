import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One-shot admin task: reset password for a specific user and notify via WhatsApp.
// Hardcoded target for safety.
const TARGET_USER_ID = '69b5f58d-4b15-4942-86cc-c078587cff37'; // kauanelopes@remax.com.br

function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pwd += chars[arr[i] % chars.length];
  return pwd;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: user, error: userErr } = await admin
      .from('users')
      .select('id, email, name, organization_id, whatsapp')
      .eq('id', TARGET_USER_ID)
      .single();

    if (userErr || !user) throw new Error('User not found');

    const newPassword = generatePassword(10);

    const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (pwErr) throw new Error('Failed to reset password: ' + pwErr.message);

    const message = `🔐 *Acesso ao Sistema Vimob*\n\nOlá ${user.name},\n\nSeu acesso foi atualizado:\n\n👤 *Login:* ${user.email}\n🔑 *Senha:* ${newPassword}\n\n🌐 *Acesse em:* https://vimob.vettercompany.com.br\n\n⚠️ Recomendamos alterar sua senha após o primeiro acesso.`;

    let whatsappResult: any = { sent: false };
    try {
      const { data: notifyData, error: notifyErr } = await admin.functions.invoke('whatsapp-notifier', {
        body: {
          organization_id: user.organization_id,
          user_id: user.id,
          message,
        },
      });
      whatsappResult = { sent: !notifyErr && notifyData?.success, data: notifyData, error: notifyErr?.message };
    } catch (e: any) {
      whatsappResult = { sent: false, error: e.message };
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: { email: user.email, name: user.name, whatsapp: user.whatsapp },
        new_password: newPassword,
        whatsapp: whatsappResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
