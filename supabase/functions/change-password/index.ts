import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Source = 'settings' | 'recovery';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validatePassword(password: string) {
  const feedback: string[] = [];
  if (password.length < 8) feedback.push('mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) feedback.push('letra maiúscula');
  if (!/[a-z]/.test(password)) feedback.push('letra minúscula');
  if (!/[0-9]/.test(password)) feedback.push('número');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) feedback.push('caractere especial');
  return { valid: feedback.length === 0, feedback };
}

function addLockDuration(now: Date, nextLevel: number) {
  const lockedUntil = new Date(now);
  if (nextLevel === 1) lockedUntil.setHours(lockedUntil.getHours() + 24);
  else if (nextLevel === 2) lockedUntil.setDate(lockedUntil.getDate() + 7);
  else if (nextLevel === 3) lockedUntil.setDate(lockedUntil.getDate() + 14);
  else lockedUntil.setDate(lockedUntil.getDate() + 30);
  return lockedUntil;
}

function formatRemaining(lockedUntil: Date) {
  const diffMs = Math.max(0, lockedUntil.getTime() - Date.now());
  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Invalid token' }, 401);

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const password = String(body.password || '');
    const source = body.source as Source;

    if (source !== 'settings' && source !== 'recovery') {
      return json({ error: 'Invalid source' }, 400);
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return json({
        allowed: false,
        message: `A senha precisa ter ${passwordCheck.feedback.join(', ')}.`,
      }, 400);
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: lockout, error: lockoutError } = await supabaseAdmin
      .from('password_change_lockouts')
      .select('user_id, locked_until, lock_level')
      .eq('user_id', user.id)
      .maybeSingle();

    if (lockoutError) throw lockoutError;

    if (lockout?.locked_until && new Date(lockout.locked_until) > now) {
      const lockedUntil = new Date(lockout.locked_until);
      return json({
        allowed: false,
        lockedUntil: lockedUntil.toISOString(),
        message: `Por segurança, você poderá alterar sua senha novamente em ${formatRemaining(lockedUntil)}.`,
      }, 429);
    }

    const { count: recentChanges, error: countError } = await supabaseAdmin
      .from('password_change_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('changed_at', last24h);

    if (countError) throw countError;

    const currentLevel = Number(lockout?.lock_level || 0);
    const threshold = currentLevel > 0 ? 1 : 2;

    if ((recentChanges || 0) >= threshold) {
      const nextLevel = Math.min(currentLevel + 1, 4);
      const lockedUntil = addLockDuration(now, nextLevel);
      const reason = currentLevel > 0
        ? 'repeated_password_change_after_lockout'
        : 'third_password_change_attempt_in_24h';

      const { error: upsertError } = await supabaseAdmin
        .from('password_change_lockouts')
        .upsert({
          user_id: user.id,
          locked_until: lockedUntil.toISOString(),
          lock_level: nextLevel,
          last_lock_reason: reason,
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;

      return json({
        allowed: false,
        lockedUntil: lockedUntil.toISOString(),
        message: `Por segurança, você poderá alterar sua senha novamente em ${formatRemaining(lockedUntil)}.`,
      }, 429);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
    if (updateError) throw updateError;

    const changedAt = now.toISOString();
    const { error: eventError } = await supabaseAdmin
      .from('password_change_events')
      .insert({
        user_id: user.id,
        changed_at: changedAt,
        source,
        metadata: {
          user_agent: req.headers.get('user-agent'),
          lock_level_at_change: currentLevel,
        },
      });

    if (eventError) throw eventError;

    const { error: clearLockError } = await supabaseAdmin
      .from('password_change_lockouts')
      .upsert({
        user_id: user.id,
        locked_until: null,
        lock_level: currentLevel,
        last_lock_reason: null,
        updated_at: changedAt,
      }, { onConflict: 'user_id' });

    if (clearLockError) throw clearLockError;

    return json({
      allowed: true,
      changedAt,
      message: 'Senha alterada com sucesso.',
    });
  } catch (error) {
    console.error('[change-password] error', error);
    const message = error instanceof Error ? error.message : 'Erro ao alterar senha';
    return json({ allowed: false, message }, 400);
  }
});
