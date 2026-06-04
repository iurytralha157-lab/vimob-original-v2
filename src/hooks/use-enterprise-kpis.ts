import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type KPIData = {
  financial: {
    ebitda: number;
    revenue: number;
    expense: number;
    roi_overview: number;
  };
  engineering: {
    total_active: number;
    avg_progress: number;
    projects: any[];
  };
};

export function useEnterpriseKPIs(dateRange?: { from: Date; to: Date }) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["enterprise-kpis", organization?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!organization?.id) return null;

      // 1. Fetch Financial Data
      let query = supabase
        .from('financial_entries')
        .select('amount, type, status, due_date, paid_date')
        .eq('organization_id', organization.id)
        .in('status', ['paid']);

      if (dateRange) {
        query = query
          .gte('paid_date', dateRange.from.toISOString())
          .lte('paid_date', dateRange.to.toISOString());
      }

      const { data: entries } = await query;

      const revenue = entries?.filter(e => e.type === 'revenue').reduce((s, e) => s + (Number(e.amount) || 0), 0) || 0;
      const expense = entries?.filter(e => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0) || 0;
      const ebitda = revenue - expense;
      const roi = expense > 0 ? (ebitda / expense) : 0;

      // 2. Fetch Engineering Data
      const { data: projects } = await supabase
        .from('construction_projects')
        .select('*')
        .eq('organization_id', organization.id)
        .in('status', ['active', 'in_progress']);

      const totalActive = projects?.length || 0;
      const avgProgress = projects?.length 
        ? projects.reduce((acc, p) => acc + (p.physical_progress_percent || 0), 0) / projects.length 
        : 0;

      return {
        financial: { 
          ebitda, 
          revenue, 
          expense, 
          roi_overview: roi 
        },
        engineering: { 
          total_active: totalActive, 
          avg_progress: avgProgress, 
          projects: projects?.map(p => ({
            id: p.id,
            name: p.name,
            progress: p.physical_progress_percent,
            end_date_planned: p.end_date_planned
          })) || [] 
        },
      };
    },
    enabled: !!organization?.id,
  });
}

export function useConstructionTimeline(projectId: string) {
  return useQuery({
    queryKey: ["construction-timeline", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useConstructionPurchases(projectId: string) {
  return useQuery({
    queryKey: ["construction-purchases", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_purchase_orders")
        .select(`
          *,
          supplier:suppliers(id, name)
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}
