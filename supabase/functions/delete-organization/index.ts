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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to verify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is a super admin using anon key client
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is super_admin in user_roles table
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: 'Only super admins can delete organizations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization ID from request body
    const { organizationId } = await req.json();
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'Organization ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Deleting organization: ${organizationId}`);

    // Delete in order respecting foreign key constraints
    // Using service role client to bypass RLS

    // 1. Get whatsapp_sessions first
    const { data: sessions } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('id')
      .eq('organization_id', organizationId);

    const sessionIds = sessions?.map(s => s.id) || [];

    // 2. Delete whatsapp_messages (via conversations)
    if (sessionIds.length > 0) {
      const { data: conversations } = await supabaseAdmin
        .from('whatsapp_conversations')
        .select('id')
        .in('session_id', sessionIds);

      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);
        await supabaseAdmin.from('whatsapp_messages').delete().in('conversation_id', conversationIds);
      }

      // 3. Delete whatsapp_conversations
      await supabaseAdmin.from('whatsapp_conversations').delete().in('session_id', sessionIds);
    }

    // 4. Delete whatsapp_sessions
    await supabaseAdmin.from('whatsapp_sessions').delete().eq('organization_id', organizationId);

    // 4. Get all leads for this organization
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('organization_id', organizationId);
    
    const leadIds = leads?.map(l => l.id) || [];

    // 5. Delete schedule_events referencing leads
    if (leadIds.length > 0) {
      await supabaseAdmin.from('schedule_events').delete().in('lead_id', leadIds);
    }

    // 6. Delete schedule_events by organization
    await supabaseAdmin.from('schedule_events').delete().eq('organization_id', organizationId);

    // 7. Delete activities
    if (leadIds.length > 0) {
      await supabaseAdmin.from('activities').delete().in('lead_id', leadIds);
    }

    // 8. Delete lead_tasks
    if (leadIds.length > 0) {
      await supabaseAdmin.from('lead_tasks').delete().in('lead_id', leadIds);
    }

    // 9. Delete lead_tags
    if (leadIds.length > 0) {
      await supabaseAdmin.from('lead_tags').delete().in('lead_id', leadIds);
    }

    // 10. Delete lead_meta
    if (leadIds.length > 0) {
      await supabaseAdmin.from('lead_meta').delete().in('lead_id', leadIds);
    }

    // 11. Delete automation_logs
    await supabaseAdmin.from('automation_logs').delete().eq('organization_id', organizationId);

    // 12. Delete assignments_log
    if (leadIds.length > 0) {
      await supabaseAdmin.from('assignments_log').delete().in('lead_id', leadIds);
    }

    // 13. Get contracts for this org
    const { data: contracts } = await supabaseAdmin
      .from('contracts')
      .select('id')
      .eq('organization_id', organizationId);
    
    const contractIds = contracts?.map(c => c.id) || [];

    // 14. Delete contract_brokers
    if (contractIds.length > 0) {
      await supabaseAdmin.from('contract_brokers').delete().in('contract_id', contractIds);
    }

    // 15. Delete commissions
    await supabaseAdmin.from('commissions').delete().eq('organization_id', organizationId);

    // 16. Delete financial_entries
    await supabaseAdmin.from('financial_entries').delete().eq('organization_id', organizationId);

    // 17. Delete contracts
    await supabaseAdmin.from('contracts').delete().eq('organization_id', organizationId);

    // 18. Delete contract_sequences
    await supabaseAdmin.from('contract_sequences').delete().eq('organization_id', organizationId);

    // 19. Delete leads
    await supabaseAdmin.from('leads').delete().eq('organization_id', organizationId);

    // 20. Delete notifications
    await supabaseAdmin.from('notifications').delete().eq('organization_id', organizationId);

    // 21. Get pipelines
    const { data: pipelines } = await supabaseAdmin
      .from('pipelines')
      .select('id')
      .eq('organization_id', organizationId);
    
    const pipelineIds = pipelines?.map(p => p.id) || [];

    // 22. Get stages
    const { data: stages } = await supabaseAdmin
      .from('stages')
      .select('id')
      .in('pipeline_id', pipelineIds.length > 0 ? pipelineIds : ['00000000-0000-0000-0000-000000000000']);
    
    const stageIds = stages?.map(s => s.id) || [];

    // 23. Delete stage_automations
    if (stageIds.length > 0) {
      await supabaseAdmin.from('stage_automations').delete().in('stage_id', stageIds);
    }

    // 24. Delete cadence_tasks_template
    const { data: cadenceTemplates } = await supabaseAdmin
      .from('cadence_templates')
      .select('id')
      .eq('organization_id', organizationId);
    
    const cadenceTemplateIds = cadenceTemplates?.map(c => c.id) || [];

    if (cadenceTemplateIds.length > 0) {
      await supabaseAdmin.from('cadence_tasks_template').delete().in('cadence_template_id', cadenceTemplateIds);
    }

    // 25. Delete cadence_templates
    await supabaseAdmin.from('cadence_templates').delete().eq('organization_id', organizationId);

    // 26. Delete stages
    if (pipelineIds.length > 0) {
      await supabaseAdmin.from('stages').delete().in('pipeline_id', pipelineIds);
    }

    // 27. Get teams
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('organization_id', organizationId);
    
    const teamIds = teams?.map(t => t.id) || [];

    // 28. Delete team_pipelines
    if (teamIds.length > 0) {
      await supabaseAdmin.from('team_pipelines').delete().in('team_id', teamIds);
    }

    // 29. Delete pipelines
    await supabaseAdmin.from('pipelines').delete().eq('organization_id', organizationId);

    // 30. Delete round_robin_members
    const { data: roundRobins } = await supabaseAdmin
      .from('round_robins')
      .select('id')
      .eq('organization_id', organizationId);
    
    const roundRobinIds = roundRobins?.map(r => r.id) || [];

    if (roundRobinIds.length > 0) {
      await supabaseAdmin.from('round_robin_members').delete().in('round_robin_id', roundRobinIds);
      await supabaseAdmin.from('round_robin_rules').delete().in('round_robin_id', roundRobinIds);
    }

    // 31. Delete round_robins
    await supabaseAdmin.from('round_robins').delete().eq('organization_id', organizationId);

    // 32. Delete team_members
    if (teamIds.length > 0) {
      await supabaseAdmin.from('team_members').delete().in('team_id', teamIds);
    }

    // 33. Delete teams
    await supabaseAdmin.from('teams').delete().eq('organization_id', organizationId);

    // 34. Delete tags
    await supabaseAdmin.from('tags').delete().eq('organization_id', organizationId);

    // 35. Delete properties
    await supabaseAdmin.from('properties').delete().eq('organization_id', organizationId);

    // 36. Delete property_sequences
    await supabaseAdmin.from('property_sequences').delete().eq('organization_id', organizationId);

    // 37. Delete property_types
    await supabaseAdmin.from('property_types').delete().eq('organization_id', organizationId);

    // 38. Delete financial_categories
    await supabaseAdmin.from('financial_categories').delete().eq('organization_id', organizationId);

    // 39. Delete commission_rules
    await supabaseAdmin.from('commission_rules').delete().eq('organization_id', organizationId);

    // 40. Delete meta_integrations
    await supabaseAdmin.from('meta_integrations').delete().eq('organization_id', organizationId);

    // 41. Delete invitations
    await supabaseAdmin.from('invitations').delete().eq('organization_id', organizationId);

    // 42. Delete organization_modules
    await supabaseAdmin.from('organization_modules').delete().eq('organization_id', organizationId);

    // 43. Delete audit_logs
    await supabaseAdmin.from('audit_logs').delete().eq('organization_id', organizationId);

    // 44. Delete super_admin_sessions
    await supabaseAdmin.from('super_admin_sessions').delete().eq('impersonating_org_id', organizationId);

    // 45. Get users for this org
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('organization_id', organizationId);
    
    const userIds = users?.map(u => u.id) || [];

    // 46. Delete user_permissions
    if (userIds.length > 0) {
      await supabaseAdmin.from('user_permissions').delete().in('user_id', userIds);
    }

    // 47. Delete user_roles
    if (userIds.length > 0) {
      await supabaseAdmin.from('user_roles').delete().in('user_id', userIds);
    }

    // 48. Delete google_calendar_tokens
    if (userIds.length > 0) {
      await supabaseAdmin.from('google_calendar_tokens').delete().in('user_id', userIds);
    }

    // 49. Delete users
    await supabaseAdmin.from('users').delete().eq('organization_id', organizationId);

    // 50. Finally delete the organization
    const { error: deleteOrgError } = await supabaseAdmin
      .from('organizations')
      .delete()
      .eq('id', organizationId);

    if (deleteOrgError) {
      console.error('Error deleting organization:', deleteOrgError);
      return new Response(
        JSON.stringify({ error: deleteOrgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully deleted organization: ${organizationId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in delete-organization:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
