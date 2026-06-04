import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useConversationLeadDetail(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ["conversation-lead-detail", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          id, name, phone, email, cidade, uf, source, created_at, valor_interesse, property_id, interest_property_id,
          stage_id, pipeline_id, deal_status,
          stage:stages(id, name, color),
          pipeline:pipelines(id, name),
          tags:lead_tags(tag:tags(id, name, color))
        `)
        .eq("id", leadId!)
        .single();

      if (error) throw error;

      // Also fetch lead_meta for campaign info
      const { data: meta } = await supabase
        .from("lead_meta")
        .select("*")
        .eq("lead_id", leadId!)
        .maybeSingle();

      return { ...data, meta };
    },
    enabled: !!leadId,
    staleTime: 15_000,
  });
}
