import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinancialEngineParams {
  action: "lead_won" | "recalculate_commissions";
  leadId?: string;
  contractId?: string;
  organizationId: string;
  userId: string;
  data?: any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, leadId, contractId, organizationId, userId, data }: FinancialEngineParams = await req.json();

    console.log(`🚀 Financial Engine: Action ${action} for Org ${organizationId}`);

    if (action === "lead_won") {
      if (!leadId) throw new Error("leadId is required for lead_won");

      // 1. Fetch Lead data
      // Use explicit relationship to avoid "more than one relationship found" error
      // between leads and properties (property_id vs interest_property_id)
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*, properties!leads_property_id_fkey(*)")
        .eq("id", leadId)
        .single();

      if (leadError) throw leadError;

      // 2. Generate Contract Number
      const year = new Date().getFullYear();
      const { data: sequence, error: seqError } = await supabase
        .from("contract_sequences")
        .select("last_number")
        .eq("organization_id", organizationId)
        .maybeSingle();

      let nextNumber = 1;
      if (sequence) {
        nextNumber = sequence.last_number + 1;
        await supabase
          .from("contract_sequences")
          .update({ last_number: nextNumber })
          .eq("organization_id", organizationId);
      } else {
        await supabase
          .from("contract_sequences")
          .insert({ organization_id: organizationId, last_number: 1 });
      }
      const contractNumber = `CTR-${year}-${String(nextNumber).padStart(5, '0')}`;

      // 3. Create Contract
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          organization_id: organizationId,
          contract_number: contractNumber,
          lead_id: leadId,
          property_id: lead.property_id,
          status: "active",
          value: data?.value || lead.valor_interesse || 0,
          down_payment: data?.downPayment || 0,
          installments: data?.installments || 1,
          client_name: lead.name,
          signing_date: new Date().toISOString().split('T')[0],
          created_by: userId,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // 4. Generate Financial Entries (Receivables)
      const totalValue = contract.value;
      const downPayment = contract.down_payment;
      const installmentsCount = contract.installments;
      const remainingValue = totalValue - downPayment;
      const installmentValue = installmentsCount > 0 ? Math.round((remainingValue / installmentsCount) * 100) / 100 : 0;
      
      const entries = [];
      if (downPayment > 0) {
        entries.push({
          organization_id: organizationId,
          contract_id: contract.id,
          type: "receivable",
          category: "Entrada",
          description: `Entrada - ${contractNumber}`,
          amount: downPayment,
          due_date: new Date().toISOString().split('T')[0],
          status: "pending",
          installment_number: 0,
          total_installments: installmentsCount,
          created_by: userId,
        });
      }

      for (let i = 1; i <= installmentsCount; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);
        entries.push({
          organization_id: organizationId,
          contract_id: contract.id,
          type: "receivable",
          category: "Parcela",
          description: `Parcela ${i}/${installmentsCount} - ${contractNumber}`,
          amount: i === installmentsCount ? (remainingValue - (installmentValue * (installmentsCount - 1))) : installmentValue,
          due_date: dueDate.toISOString().split('T')[0],
          status: "pending",
          installment_number: i,
          total_installments: installmentsCount,
          created_by: userId,
        });
      }

      if (entries.length > 0) {
        const { error: entriesError } = await supabase.from("financial_entries").insert(entries);
        if (entriesError) throw entriesError;
      }

      // 5. Calculate Commissions
      const brokerIds = data?.brokerIds || (lead.assigned_user_id ? [lead.assigned_user_id] : []);
      if (brokerIds.length > 0) {
        const commissionPercentage = data?.commissionPercentage || lead.properties?.commission_percentage || 5;
        const perBrokerPercentage = commissionPercentage / brokerIds.length;
        
        const commissions = brokerIds.map((bId: string) => ({
          organization_id: organizationId,
          contract_id: contract.id,
          user_id: bId,
          property_id: lead.property_id,
          base_value: totalValue,
          percentage: perBrokerPercentage,
          amount: totalValue * (perBrokerPercentage / 100),
          calculated_value: totalValue * (perBrokerPercentage / 100),
          status: "forecast",
          forecast_date: new Date().toISOString().split('T')[0],
          notes: `Gerado automaticamente via Financial Engine - ${contractNumber}`,
        }));

        const { error: commError } = await supabase.from("commissions").insert(commissions);
        if (commError) throw commError;

        // 6. Create Payable Entry for total commissions
        const totalCommAmount = commissions.reduce((acc: number, curr: any) => acc + curr.amount, 0);
        if (totalCommAmount > 0) {
          await supabase.from("financial_entries").insert({
            organization_id: organizationId,
            contract_id: contract.id,
            type: "payable",
            category: "Comissão",
            description: `Comissões - ${contractNumber}`,
            amount: totalCommAmount,
            due_date: new Date().toISOString().split('T')[0],
            status: "pending",
            created_by: userId,
          });
        }
      }

      // 7. Update Lead Status
      await supabase.from("leads").update({ deal_status: "won", won_at: new Date().toISOString() }).eq("id", leadId);

      return new Response(JSON.stringify({ success: true, contractId: contract.id, contractNumber }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });

  } catch (error: any) {
    console.error("❌ Financial Engine Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});