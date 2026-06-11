import { supabase } from "@/integrations/supabase/client";

export async function fetchDashboardTeamLeadIds(
  teamId: string | null | undefined,
  dateRange?: { from: Date; to: Date } | null,
): Promise<string[] | null> {
  if (!teamId) return null;

  const { data, error } = await (supabase as any).rpc("get_dashboard_team_lead_ids", {
    p_team_id: teamId,
    p_date_from: dateRange?.from?.toISOString() || null,
    p_date_to: dateRange?.to?.toISOString() || null,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((item: any) => item.lead_id).filter(Boolean);
}

export function applyLeadIdFilter(query: any, leadIds: string[] | null): any {
  if (leadIds === null) return query;
  if (leadIds.length === 0) {
    return query.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  return query.in("id", leadIds);
}
