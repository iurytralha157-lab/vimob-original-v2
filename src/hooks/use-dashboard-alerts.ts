import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isBefore, startOfDay } from "date-fns";

export function useDashboardAlerts() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["dashboard-alerts", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { purchases: [], finance: [] };

      // 1. Fetch Overdue/Waiting Purchases
      const { data: purchases } = await supabase
        .from("construction_purchase_orders")
        .select(`
          *,
          project:construction_projects(id, name)
        `)
        .eq("organization_id", organization.id)
        .in("status", ["ordered", "partially_delivered"]);

      const now = startOfDay(new Date());
      const overduePurchases = (purchases || []).filter(p => 
        p.delivery_date_planned && isBefore(new Date(p.delivery_date_planned), now)
      );

      // 2. Fetch Overdue Finance
      const { data: finance } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("status", "pending")
        .lte("due_date", now.toISOString());

      return {
        purchases: overduePurchases,
        finance: finance || [],
        total: overduePurchases.length + (finance?.length || 0)
      };
    },
    enabled: !!organization?.id,
    refetchInterval: 1000 * 60 * 5, // 5 minutes
  });
}
