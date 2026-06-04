import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AppRole = 'admin' | 'user';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) throw new Error('Invalid token');

    const actorId = authData.user.id;
    const { userId, updates } = await req.json();
    if (!userId || !updates || typeof updates !== 'object') {
      throw new Error('Dados invalidos para atualizar usuario');
    }

    const { data: actor, error: actorError } = await supabaseAdmin
      .from('users')
      .select('id, role, organization_id')
      .eq('id', actorId)
      .single();

    if (actorError || !actor) throw new Error('Usuario solicitante nao encontrado');

    const { data: actorSuperRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', actorId)
      .eq('role', 'super_admin')
      .maybeSingle();

    const isSuperAdmin = actor.role === 'super_admin' || !!actorSuperRole;
    const isOrgAdmin = actor.role === 'admin' && !!actor.organization_id;

    if (!isSuperAdmin && !isOrgAdmin) {
      throw new Error('Sem permissao para atualizar usuarios');
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, role, organization_id')
      .eq('id', userId)
      .single();

    if (targetError || !target) throw new Error('Usuario de destino nao encontrado');

    if (!isSuperAdmin && target.organization_id !== actor.organization_id) {
      throw new Error('Usuario fora da sua organizacao');
    }

    if (!isSuperAdmin && target.role === 'super_admin') {
      throw new Error('Nao e permitido alterar super administradores');
    }

    const allowedUpdates: Record<string, unknown> = {};
    if ('role' in updates) {
      const nextRole = updates.role as AppRole;
      if (nextRole !== 'admin' && nextRole !== 'user') {
        throw new Error('Papel de usuario invalido');
      }
      allowedUpdates.role = nextRole;
    }
    if ('is_active' in updates) {
      allowedUpdates.is_active = !!updates.is_active;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error('Nenhum campo permitido para atualizar');
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(allowedUpdates)
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError) throw new Error(`Falha ao atualizar usuario: ${updateError.message}`);

    if ('role' in allowedUpdates) {
      const nextRole = allowedUpdates.role as AppRole;

      const { error: deleteRoleError } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .in('role', ['admin', 'user']);
      if (deleteRoleError) throw new Error(`Falha ao limpar papeis: ${deleteRoleError.message}`);

      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role: nextRole });
      if (insertRoleError) throw new Error(`Falha ao salvar papel: ${insertRoleError.message}`);

      if (updatedUser.organization_id) {
        const { error: memberRoleError } = await supabaseAdmin
          .from('organization_members')
          .update({ role: nextRole })
          .eq('user_id', userId)
          .eq('organization_id', updatedUser.organization_id);
        if (memberRoleError) throw new Error(`Falha ao atualizar membro: ${memberRoleError.message}`);
      }
    }

    if ('is_active' in allowedUpdates && updatedUser.organization_id) {
      const { error: memberActiveError } = await supabaseAdmin
        .from('organization_members')
        .update({ is_active: allowedUpdates.is_active })
        .eq('user_id', userId)
        .eq('organization_id', updatedUser.organization_id);
      if (memberActiveError) throw new Error(`Falha ao atualizar status do membro: ${memberActiveError.message}`);
    }

    return new Response(JSON.stringify({ success: true, user: updatedUser }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
