import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinancialEntry {
  id: string;
  organization_id: string;
  type: string;
  category: string | null;
  description: string | null;
  amount: number;
  due_date: string | null;
  payment_method: string | null;
  contract_id: string | null;
  lead_id: string | null;
  broker_id: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_type: string | null;
  created_by: string | null;
  parent_entry_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 Smart Recurring Generator - Starting...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    console.log(`📅 Processing for date: ${today.toISOString().split("T")[0]}`);

    // Fetch all recurring entries
    const { data: recurringEntries, error: fetchError } = await supabase
      .from("financial_entries")
      .select("*")
      .eq("is_recurring", true)
      .not("recurring_type", "is", null);

    if (fetchError) {
      console.error("❌ Error fetching recurring entries:", fetchError);
      throw fetchError;
    }

    console.log(`📋 Found ${recurringEntries?.length || 0} recurring entries`);

    let createdCount = 0;
    let skippedCount = 0;
    let valueChangeAlerts = 0;

    for (const entry of (recurringEntries || []) as FinancialEntry[]) {
      const entryDueDate = entry.due_date ? new Date(entry.due_date) : null;
      if (!entryDueDate) {
        skippedCount++;
        continue;
      }

      const entryDay = entryDueDate.getDate();
      let shouldCreate = false;
      let nextDueDate: Date | null = null;

      switch (entry.recurring_type) {
        case "monthly":
          if (currentDay === entryDay) {
            shouldCreate = true;
            nextDueDate = new Date(currentYear, currentMonth, entryDay);
          }
          break;
        case "weekly":
          if (today.getDay() === entryDueDate.getDay()) {
            shouldCreate = true;
            nextDueDate = new Date(today);
          }
          break;
        case "yearly":
          if (currentMonth === entryDueDate.getMonth() && currentDay === entryDay) {
            shouldCreate = true;
            nextDueDate = new Date(currentYear, currentMonth, entryDay);
          }
          break;
      }

      if (!shouldCreate || !nextDueDate) {
        skippedCount++;
        continue;
      }

      const dueDateStr = nextDueDate.toISOString().split("T")[0];

      // Check if entry already exists for this period
      const { data: existingEntry } = await supabase
        .from("financial_entries")
        .select("id")
        .eq("organization_id", entry.organization_id)
        .eq("parent_entry_id", entry.id)
        .eq("due_date", dueDateStr)
        .maybeSingle();

      if (existingEntry) {
        skippedCount++;
        continue;
      }

      // Detect value changes - check last child entry
      const { data: lastChild } = await supabase
        .from("financial_entries")
        .select("amount")
        .eq("parent_entry_id", entry.id)
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastChild && Math.abs(lastChild.amount - entry.amount) > 0.01) {
        console.log(
          `⚠️ Value change detected for entry ${entry.id}: ${lastChild.amount} → ${entry.amount}`
        );
        valueChangeAlerts++;

        // Notify admins about value change
        try {
          const { data: admins } = await supabase
            .from("users")
            .select("id")
            .eq("organization_id", entry.organization_id)
            .eq("role", "admin");

          for (const admin of admins || []) {
            await supabase.rpc("create_notification", {
              p_user_id: admin.id,
              p_organization_id: entry.organization_id,
              p_title: "⚠️ Valor de recorrência alterado",
              p_content: `${entry.description || "Lançamento recorrente"}: valor mudou de R$ ${lastChild.amount.toFixed(2)} para R$ ${entry.amount.toFixed(2)}`,
              p_type: "commission",
            });
          }
        } catch (notifErr) {
          console.error("Failed to send value change notification:", notifErr);
        }
      }

      // Create the new recurring entry
      const { error: insertError } = await supabase
        .from("financial_entries")
        .insert({
          organization_id: entry.organization_id,
          type: entry.type,
          category: entry.category,
          description: entry.description,
          amount: entry.amount,
          due_date: dueDateStr,
          payment_method: entry.payment_method,
          contract_id: entry.contract_id,
          lead_id: entry.lead_id,
          broker_id: entry.broker_id,
          notes: entry.notes ? `${entry.notes} (Recorrente)` : "(Recorrente)",
          status: "pending",
          is_recurring: false,
          parent_entry_id: entry.id,
          created_by: entry.created_by,
        });

      if (insertError) {
        console.error(`❌ Error creating entry for ${entry.id}:`, insertError);
        continue;
      }

      console.log(`✅ Created recurring entry for ${entry.id} on ${dueDateStr}`);
      createdCount++;
    }

    // Detect possible cancellations (entries with no activity for 3+ months)
    let cancellationAlerts = 0;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: staleEntries } = await supabase
      .from("financial_entries")
      .select("id, organization_id, description")
      .eq("is_recurring", true)
      .lt("updated_at", threeMonthsAgo.toISOString());

    for (const stale of staleEntries || []) {
      // Check if children were created recently
      const { data: recentChild } = await supabase
        .from("financial_entries")
        .select("id")
        .eq("parent_entry_id", stale.id)
        .gte("created_at", threeMonthsAgo.toISOString())
        .limit(1)
        .maybeSingle();

      if (!recentChild) {
        cancellationAlerts++;
        console.log(`🔍 Possible cancellation: ${stale.description} (${stale.id})`);
      }
    }

    const summary = {
      processed: recurringEntries?.length || 0,
      created: createdCount,
      skipped: skippedCount,
      valueChangeAlerts,
      cancellationAlerts,
      date: today.toISOString(),
    };

    console.log("📊 Summary:", JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Fatal error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
