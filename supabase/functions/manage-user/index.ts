import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the caller is a super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid token');
    }

    // Check if user is super admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    const isSuperAdmin = userData?.role === 'super_admin' || !!roleData;

    if (!isSuperAdmin) {
      throw new Error('Unauthorized: Only super admins can manage users');
    }

    const { action, userId, ...data } = await req.json();

    console.log(`[manage-user] Action: ${action}, User: ${userId}`);

    let result;

    switch (action) {
      case 'create': {
        // Check if user already exists
        const { email, password, name, organization_id, role } = data;

        if (!organization_id) {
          throw new Error('Organizacao e obrigatoria para criar usuario');
        }

        const { data: orgLimit, error: orgLimitError } = await supabaseAdmin
          .from('organizations')
          .select('max_users')
          .eq('id', organization_id)
          .single();

        if (orgLimitError) {
          throw new Error(`Falha ao verificar limite da organizacao: ${orgLimitError.message}`);
        }

        const { count: activeUsersCount, error: activeUsersError } = await supabaseAdmin
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organization_id)
          .eq('is_active', true);

        if (activeUsersError) {
          throw new Error(`Falha ao verificar usuarios ativos: ${activeUsersError.message}`);
        }

        const maxUsers = Number(orgLimit?.max_users || 0);
        if (maxUsers > 0 && (activeUsersCount || 0) >= maxUsers) {
          throw new Error(`Limite do plano atingido: maximo de ${maxUsers} usuarios.`);
        }
        
        // Use listUsers to find by email
        const { data: { users: existingUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.find(u => u.email?.toLowerCase() === email?.toLowerCase());

        if (existingUser) {
          console.log(`[manage-user] User already exists: ${existingUser.id}. Moving to organization: ${organization_id}`);
          
          // Update existing user in public.users
          const { error: moveError } = await supabaseAdmin
            .from('users')
            .update({ 
              organization_id, 
              role: role || 'user',
              name: name || existingUser.user_metadata?.name
            })
            .eq('id', existingUser.id);

          if (moveError) {
            throw new Error(`Failed to move existing user: ${moveError.message}`);
          }

          result = { 
            success: true, 
            message: 'User already existed and was moved to this organization', 
            user: existingUser,
            moved: true 
          };
        } else {
          // Create new user in auth.users
          const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name }
          });

          if (createError) {
            throw new Error(`Failed to create auth user: ${createError.message}`);
          }

          // Ensure the public.users record has the right org and role
          // (Wait a bit for the trigger to create the record if needed)
          await new Promise(resolve => setTimeout(resolve, 500));

          const { error: publicUpdateError } = await supabaseAdmin
            .from('users')
            .update({ 
              organization_id, 
              role,
              name
            })
            .eq('id', createData.user.id);

          if (publicUpdateError) {
            console.error('[manage-user] Error updating public user:', publicUpdateError);
          }

          result = { success: true, message: 'User created successfully', user: createData.user };
        }
        break;
      }

      case 'delete': {
        // Delete user from auth.users (cascades to public.users and user_roles)
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteAuthError) {
          throw new Error(`Failed to delete auth user: ${deleteAuthError.message}`);
        }
        result = { success: true, message: 'User deleted successfully' };
        break;
      }

      case 'update': {
        if (!userId) {
          throw new Error('User ID is required for update action');
        }

        // If email is provided, validate and update Auth first
        if (data.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(data.email)) {
            throw new Error('Formato de e-mail inválido');
          }

          // 1. Update Supabase Auth first
          const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: data.email,
            email_confirm: true
          });

          if (authEmailError) {
            if (authEmailError.message.toLowerCase().includes('already registered') || 
                authEmailError.message.toLowerCase().includes('already exists')) {
              throw new Error('Este e-mail já está em uso por outro usuário');
            }
            throw new Error(`Erro ao atualizar e-mail no Auth: ${authEmailError.message}`);
          }
        }

        // 2. Only if Auth is successful (or not being updated), update public.users
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update(data)
          .eq('id', userId);
        
        if (updateError) {
          throw new Error(`Falha ao atualizar dados do usuário: ${updateError.message}`);
        }

        result = { success: true, message: 'Usuário atualizado com sucesso' };
        break;
      }

      case 'reset_password': {
        // Reset user password via admin API
        const { password: newPassword } = data;
        if (!newPassword) {
          throw new Error('Password is required for reset_password action');
        }
        const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });
        if (resetError) {
          throw new Error(`Failed to reset password: ${resetError.message}`);
        }
        result = { success: true, message: 'Password reset successfully' };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[manage-user] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
