import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StageAutomation {
  id: string;
  organization_id: string;
  stage_id: string;
  automation_type: string;
  trigger_days: number | null;
  target_stage_id: string | null;
  whatsapp_template: string | null;
  alert_message: string | null;
  is_active: boolean;
}

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  assigned_user_id: string | null;
  organization_id: string;
  stage_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active automations that are inactivity-based
    const { data: automations, error: automationsError } = await supabase
      .from('stage_automations')
      .select('*')
      .eq('is_active', true)
      .in('automation_type', ['move_after_inactivity', 'alert_on_inactivity']);

    if (automationsError) {
      throw new Error(`Error fetching automations: ${automationsError.message}`);
    }

    const results: { automation_id: string; leads_processed: number; actions: string[] }[] = [];

    for (const automation of automations as StageAutomation[]) {
      const triggerDays = automation.trigger_days || 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - triggerDays);

      // Find leads in this stage that haven't had activity recently
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, phone, assigned_user_id, organization_id, stage_id')
        .eq('stage_id', automation.stage_id)
        .eq('organization_id', automation.organization_id);

      if (leadsError) {
        console.error(`Error fetching leads for automation ${automation.id}:`, leadsError);
        continue;
      }

      const actionsPerformed: string[] = [];

      for (const lead of leads as Lead[]) {
        // Check last activity for this lead
        const { data: lastActivity } = await supabase
          .from('activities')
          .select('created_at')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const lastActivityDate = lastActivity?.created_at 
          ? new Date(lastActivity.created_at) 
          : new Date(0); // If no activity, consider very old

        // Check if lead is inactive
        if (lastActivityDate < cutoffDate) {
          if (automation.automation_type === 'move_after_inactivity' && automation.target_stage_id) {
            // Move lead to target stage
            const { error: updateError } = await supabase
              .from('leads')
              .update({ 
                stage_id: automation.target_stage_id,
                stage_entered_at: new Date().toISOString()
              })
              .eq('id', lead.id);

            if (!updateError) {
              // Log the action
              await supabase.from('automation_logs').insert([{
                automation_id: automation.id,
                lead_id: lead.id,
                organization_id: lead.organization_id,
                action_taken: 'move_stage',
                details: {
                  from_stage: lead.stage_id,
                  to_stage: automation.target_stage_id,
                  trigger_days: triggerDays
                }
              }]);

              // Create activity log
              await supabase.from('activities').insert([{
                lead_id: lead.id,
                type: 'stage_change',
                content: `Lead movido automaticamente por inatividade (${triggerDays} dias)`
              }]);

              actionsPerformed.push(`Moved lead ${lead.name} to target stage`);
            }
          } else if (automation.automation_type === 'alert_on_inactivity' && lead.assigned_user_id) {
            // Create notification for the assigned user
            const { error: notifError } = await supabase
              .from('notifications')
              .insert([{
                user_id: lead.assigned_user_id,
                organization_id: lead.organization_id,
                title: 'Alerta de Inatividade',
                content: automation.alert_message || `O lead ${lead.name} está há ${triggerDays} dias sem atendimento`,
                type: 'inactivity_alert',
                lead_id: lead.id
              }]);

            if (!notifError) {
              // Log the action
              await supabase.from('automation_logs').insert([{
                automation_id: automation.id,
                lead_id: lead.id,
                organization_id: lead.organization_id,
                action_taken: 'send_alert',
                details: {
                  user_id: lead.assigned_user_id,
                  message: automation.alert_message,
                  trigger_days: triggerDays
                }
              }]);

              actionsPerformed.push(`Alert sent for lead ${lead.name}`);
            }
          }
        }
      }

      results.push({
        automation_id: automation.id,
        leads_processed: leads?.length || 0,
        actions: actionsPerformed
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        automations_processed: automations?.length || 0,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Automation runner error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
