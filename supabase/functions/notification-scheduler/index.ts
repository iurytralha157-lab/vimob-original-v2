import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_INTERVALS = [
  { minutes: 60, type: 'reminder', target: 'lead' },
  { minutes: 30, type: 'reminder', target: 'lead' },
  { minutes: 30, type: 'reminder', target: 'user' },
  { minutes: 15, type: 'reminder', target: 'user' },
  { minutes: 10, type: 'reminder', target: 'user' },
  { minutes: 10, type: 'arrival', target: 'lead' },
  { minutes: 5, type: 'reminder', target: 'user' },
  { minutes: 0, type: 'starting_now', target: 'user' }
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    
    // Process schedule_events reminders
    const { data: upcomingEvents, error: eventsError } = await supabase
      .from("schedule_events")
      .select(`
        id, user_id, organization_id, title, start_time, lead_id, event_type,
        lead:leads(id, name, phone)
      `)
      .neq("status", "cancelled")
      .gte("start_time", new Date(now.getTime() - 5 * 60 * 1000).toISOString())
      .lte("start_time", new Date(now.getTime() + 70 * 60 * 1000).toISOString());

    if (eventsError) throw eventsError;

    console.log(`Processing ${upcomingEvents?.length || 0} upcoming events at ${now.toISOString()}`);

    for (const event of upcomingEvents || []) {
      const startTime = new Date(event.start_time);
      const diffMinutes = Math.round((startTime.getTime() - now.getTime()) / (1000 * 60));
      const eventType = event.event_type;
      
      // Real estate critical events
      const isCritical = ['meeting', 'visit', 'call'].includes(eventType || '');

      console.log(`Checking event "${event.title}" (${event.id}) - Type: ${eventType} - Starts in ${diffMinutes}m`);

      for (const interval of REMINDER_INTERVALS) {
        // Skip non-critical interval types for generic events
        if (!isCritical && (interval.minutes <= 30 || interval.target === 'lead')) {
          continue;
        }

        // Window-based check: allow +/- 1 minute around the target interval
        // This ensures that even if the cron runs slightly off, we catch the event
        if (diffMinutes >= interval.minutes - 1 && diffMinutes <= interval.minutes + 1) {
          const reminderTag = `[EVT_${event.id}_${interval.minutes}_${interval.target}]`;
          
          // Check if already sent
          const { data: existingNotif } = await supabase
            .from("notifications")
            .select("id")
            .ilike("content", `%${reminderTag}%`)
            .limit(1);

          if (existingNotif && existingNotif.length > 0) {
            console.log(`Reminder ${reminderTag} already sent, skipping.`);
            continue;
          }

          const formattedTime = startTime.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });

          if (interval.target === 'user') {
            let title = "";
            let content = "";
            
            if (interval.minutes === 0) {
              title = "📍 Início de Compromisso";
              content = `Seu compromisso "${event.title}" está começando agora (${formattedTime}). ${reminderTag}`;
            } else {
              title = `⏱️ Lembrete: ${interval.minutes} min`;
              content = `Em ${interval.minutes} minutos: ${event.title} às ${formattedTime}. ${reminderTag}`;
            }

            console.log(`Sending user notification: ${title}`);
            
            await fetch(`${supabaseUrl}/functions/v1/notification-dispatcher`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                event_key: "appointment_reminder",
                organization_id: event.organization_id,
                user_id: event.user_id,
                lead_id: event.lead_id,
                variables: {
                  titulo: event.title,
                  horario: formattedTime,
                  minutos: interval.minutes,
                  nome_lead: event.lead?.name || 'Não informado'
                },
                dedupe_key: reminderTag
              }),
            });
          }

          if (interval.target === 'lead' && event.lead?.phone) {
            let message = "";
            const leadName = event.lead.name || "Cliente";
            const eventTitle = event.title.toLowerCase();
            const isVisit = eventTitle.includes('visita') || event.event_type === 'visit';
            const actionLabel = isVisit ? "nossa visita" : "nosso compromisso";
            
            if (interval.minutes === 60) {
              message = `Olá ${leadName}, tudo bem? Confirmando ${actionLabel} agendado para hoje às *${formattedTime}*. Até breve!`;
            } else if (interval.minutes === 30) {
              message = `Oi ${leadName}, confirmando ${actionLabel} em 30 minutos, às *${formattedTime}*. Já estou me preparando por aqui.`;
            } else if (interval.minutes === 10) {
              message = `Olá ${leadName}, em 10 minutos iniciaremos ${actionLabel} (*${formattedTime}*). Nos falamos em breve!`;
            }

              await fetch(`${supabaseUrl}/functions/v1/notification-dispatcher`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  event_key: "appointment_reminder",
                  organization_id: event.organization_id,
                  recipient: event.lead.phone,
                  lead_id: event.lead.id,
                  variables: {
                    nome_lead: leadName,
                    acao: actionLabel,
                    horario: formattedTime,
                    minutos: interval.minutes
                  },
                  dedupe_key: reminderTag
                }),
              });
          }
        }
      }
    }

    // Cadence Tasks and Financial Logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // Tasks Vencendo Hoje, Amanhã, Atrasadas
    const { data: allTasks } = await supabase
      .from("lead_tasks")
      .select(`id, lead_id, title, due_date, type, lead:leads(id, name, assigned_user_id, organization_id)`)
      .eq("is_done", false);

    for (const task of allTasks || []) {
      const lead = task.lead as any;
      if (!lead?.assigned_user_id) continue;

      const dueDate = new Date(task.due_date);
      let title = "";
      if (dueDate >= today && dueDate <= todayEnd) title = "⚠️ Tarefa de cadência vence hoje!";
      else if (dueDate >= tomorrow && dueDate <= tomorrowEnd) title = "📅 Tarefa de cadência vence amanhã";
      else if (dueDate < today) title = "🚨 Tarefa de cadência atrasada!";

      if (title) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", lead.assigned_user_id)
          .ilike("title", title)
          .ilike("content", `%${task.title}%`)
          .gte("created_at", today.toISOString())
          .limit(1);

        if (existing?.length === 0) {
          await supabase.from("notifications").insert({
            user_id: lead.assigned_user_id,
            organization_id: lead.organization_id,
            title,
            content: `Tarefa: "${task.title}" do lead "${lead.name}".`,
            type: "task",
            lead_id: lead.id,
          });
        }
      }
    }

    // Financial Logic (simplified but preserved)
    // Only process for organizations that have the financial module enabled
    const { data: financialEntries, error: financialError } = await supabase
      .from("financial_entries")
      .select(`
        id, 
        organization_id, 
        type, 
        description, 
        amount, 
        due_date,
        organization:organizations(is_financial_module_enabled)
      `)
      .eq("status", "pending");

    if (financialError) {
      console.error("Error fetching financial entries:", financialError);
    }

    for (const entry of financialEntries || []) {
      const org = entry.organization as any;
      if (!org?.is_financial_module_enabled) {
        // Skip notifications if financial module is disabled for this organization
        continue;
      }

      const typeLabel = entry.type === 'payable' ? 'A Pagar' : 'A Receber';
      let fTitle = "";
      if (entry.due_date === todayStr) fTitle = "⚠️ Conta vence hoje!";
      else if (entry.due_date < todayStr) fTitle = "🚨 Conta em atraso!";

      if (fTitle) {
        const { data: admins } = await supabase.from("users").select("id").eq("organization_id", entry.organization_id).eq("role", "admin");
        for (const admin of admins || []) {
          const { data: existing } = await supabase.from("notifications").select("id").eq("user_id", admin.id).ilike("title", fTitle).ilike("content", `%${entry.description}%`).gte("created_at", today.toISOString()).limit(1);
          if (existing?.length === 0) {
            await supabase.from("notifications").insert({
              user_id: admin.id,
              organization_id: entry.organization_id,
              title: fTitle,
              content: `${typeLabel}: ${entry.description}`,
              type: "commission",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});