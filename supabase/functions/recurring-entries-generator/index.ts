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
  notes: string | null;
  is_recurring: boolean;
  recurring_type: string | null;
  created_by: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 Starting recurring entries generator...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date info
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    console.log(`📅 Processing for date: ${today.toISOString().split('T')[0]}`);

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

    for (const entry of (recurringEntries || []) as FinancialEntry[]) {
      const entryDueDate = entry.due_date ? new Date(entry.due_date) : null;
      if (!entryDueDate) {
        console.log(`⏭️ Skipping entry ${entry.id} - no due date`);
        skippedCount++;
        continue;
      }

      const entryDay = entryDueDate.getDate();
      let shouldCreate = false;
      let nextDueDate: Date | null = null;

      switch (entry.recurring_type) {
        case "monthly":
          // Create if today matches the original due day
          if (currentDay === entryDay) {
            shouldCreate = true;
            nextDueDate = new Date(currentYear, currentMonth, entryDay);
          }
          break;

        case "weekly":
          // Create if today is the same day of week as original
          if (today.getDay() === entryDueDate.getDay()) {
            shouldCreate = true;
            nextDueDate = new Date(today);
          }
          break;

        case "yearly":
          // Create if today matches original month and day
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

      // Check if entry already exists for this period
      const dueDateStr = nextDueDate.toISOString().split('T')[0];
      const { data: existingEntry, error: checkError } = await supabase
        .from("financial_entries")
        .select("id")
        .eq("organization_id", entry.organization_id)
        .eq("parent_entry_id", entry.id)
        .eq("due_date", dueDateStr)
        .maybeSingle();

      if (checkError) {
        console.error(`❌ Error checking existing entry for ${entry.id}:`, checkError);
        continue;
      }

      if (existingEntry) {
        console.log(`⏭️ Entry already exists for ${entry.id} on ${dueDateStr}`);
        skippedCount++;
        continue;
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
          notes: entry.notes ? `${entry.notes} (Recorrente)` : "(Recorrente)",
          status: "pending",
          is_recurring: false, // Child entries are not recurring themselves
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

    const summary = {
      processed: recurringEntries?.length || 0,
      created: createdCount,
      skipped: skippedCount,
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
