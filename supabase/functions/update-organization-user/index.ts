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
    const { userId, organizationId, updates } = await req.json();
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

    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (targetError || !target) throw new Error('Usuario de destino nao encontrado');

    const requestedOrgId = typeof organizationId === 'string' && organizationId ? organizationId : null;
    const targetOrgId = requestedOrgId || actor.organization_id || target.organization_id;

    if (!targetOrgId) {
      throw new Error('Organizacao alvo nao encontrada');
    }

    const { data: actorMembership } = await supabaseAdmin
      .from('organization_members')
      .select('role, is_active')
      .eq('user_id', actorId)
      .eq('organization_id', targetOrgId)
      .maybeSingle();

    const isSuperAdmin = actor.role === 'super_admin' || !!actorSuperRole;
    const isOrgAdminForTarget =
      (actor.organization_id === targetOrgId && actor.role === 'admin') ||
      (actorMembership?.role === 'admin' && actorMembership?.is_active !== false);

    if (!isSuperAdmin && !isOrgAdminForTarget) {
      throw new Error('Sem permissao para atualizar usuarios nesta organizacao');
    }

    const { data: targetMembership } = await supabaseAdmin
      .from('organization_members')
      .select('role, is_active, organization_id')
      .eq('user_id', userId)
      .eq('organization_id', targetOrgId)
      .maybeSingle();

    const targetBelongsToOrg = target.organization_id === targetOrgId || !!targetMembership;

    if (!isSuperAdmin && !targetBelongsToOrg) {
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

    const nextRole = ('role' in allowedUpdates ? allowedUpdates.role : targetMembership?.role || target.role || 'user') as AppRole;
    const nextMemberActive =
      'is_active' in allowedUpdates
        ? !!allowedUpdates.is_active
        : targetMembership?.is_active ?? target.is_active ?? true;

    if ('role' in allowedUpdates) {
      const { error: memberRoleError } = await supabaseAdmin
        .from('organization_members')
        .upsert({
          user_id: userId,
          organization_id: targetOrgId,
          role: nextRole,
          is_active: nextMemberActive,
        }, { onConflict: 'user_id,organization_id' });
      if (memberRoleError) throw new Error(`Falha ao atualizar membro: ${memberRoleError.message}`);
    }

    if ('is_active' in allowedUpdates) {
      const { error: memberActiveError } = await supabaseAdmin
        .from('organization_members')
        .upsert({
          user_id: userId,
          organization_id: targetOrgId,
          role: nextRole,
          is_active: nextMemberActive,
        }, { onConflict: 'user_id,organization_id' });
      if (memberActiveError) throw new Error(`Falha ao atualizar status do membro: ${memberActiveError.message}`);
    }

    const userUpdates: Record<string, unknown> = {};
    const targetUsesThisOrgAsCurrent = target.organization_id === targetOrgId || !target.organization_id;

    if ('role' in allowedUpdates && targetUsesThisOrgAsCurrent) {
      userUpdates.role = nextRole;
    }

    if ('is_active' in allowedUpdates) {
      if (nextMemberActive) {
        userUpdates.is_active = true;
        if (targetUsesThisOrgAsCurrent || target.is_active === false) {
          userUpdates.organization_id = targetOrgId;
          userUpdates.role = nextRole;
        }
      } else {
        const { data: otherActiveMembership } = await supabaseAdmin
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', userId)
          .neq('organization_id', targetOrgId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (otherActiveMembership) {
          if (targetUsesThisOrgAsCurrent) {
            userUpdates.organization_id = otherActiveMembership.organization_id;
            userUpdates.role = otherActiveMembership.role || 'user';
          }
          userUpdates.is_active = true;
        } else if (targetUsesThisOrgAsCurrent) {
          userUpdates.is_active = false;
        }
      }
    }

    let updatedUser = target;
    if (Object.keys(userUpdates).length > 0) {
      const { data, error: updateError } = await supabaseAdmin
        .from('users')
        .update(userUpdates)
        .eq('id', userId)
        .select('*')
        .single();

      if (updateError) throw new Error(`Falha ao atualizar usuario: ${updateError.message}`);
      updatedUser = data;
    }

    if ('role' in allowedUpdates && targetUsesThisOrgAsCurrent) {
      const { error: deleteRoleError } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .in('role', ['admin', 'user']);
      if (deleteRoleError) throw new Error(`Falha ao limpar papeis: ${deleteRoleError.message}`);

      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: userId, role: nextRole }, { onConflict: 'user_id,role' });
      if (insertRoleError) throw new Error(`Falha ao salvar papel: ${insertRoleError.message}`);
    }

    const responseUser = {
      ...updatedUser,
      organization_id: targetOrgId,
      role: nextRole,
      is_active: updatedUser.is_active !== false && nextMemberActive !== false,
      organization_member_is_active: nextMemberActive,
    };

    return new Response(JSON.stringify({ success: true, user: responseUser }), {
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
