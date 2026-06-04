import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface OperationalRequest {
  id: string;
  organization_id: string;
  lead_id: string | null;
  project_id: string | null;
  type: 'finance' | 'architecture' | 'engineering' | 'purchase';
  status: 'pending' | 'in_analysis' | 'approved' | 'rejected' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string | null;
  metadata: any;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  lead?: { name: string };
  project?: { name: string };
  assignee?: { name: string; avatar_url: string | null };
}

export function useOperationalRequests(filters?: { type?: string; status?: string; leadId?: string; dateRange?: { from: Date; to: Date } }) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["operational-requests", organization?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("operational_requests" as any)
        .select(`
          *,
          lead:leads(id, name),
          project:construction_projects(id, name),
          assignee:users!assignee_id(id, name, avatar_url)
        `)
        .eq("organization_id", organization?.id);

      if (filters?.dateRange) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.leadId) query = query.eq("lead_id", filters.leadId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as OperationalRequest[];
    },
    enabled: !!organization?.id,
  });
}

export function useCreateOperationalRequest() {
  const queryClient = useQueryClient();
  const { organization, profile } = useAuth();

  return useMutation({
    mutationFn: async (values: Partial<OperationalRequest>) => {
      const { data, error } = await supabase
        .from("operational_requests" as any)
        .insert([{
          ...values,
          organization_id: organization?.id,
          created_by: profile?.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-requests"] });
      toast.success("Solicitação criada com sucesso!");
    },
  });
}

export function useUpdateOperationalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<OperationalRequest> & { id: string }) => {
      const { data, error } = await supabase
        .from("operational_requests" as any)
        .update(values)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["operational-requests"] });
      queryClient.invalidateQueries({ queryKey: ["operational-request", data.id] });
      toast.success("Solicitação atualizada!");
    },
  });
}

export function useOperationalTimeline(leadId?: string, projectId?: string) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["operational-timeline", organization?.id, leadId, projectId],
    queryFn: async () => {
      let query = supabase
        .from("operational_timelines" as any)
        .select(`
          *,
          author:users!created_by(id, name, avatar_url)
        `)
        .eq("organization_id", organization?.id)
        .order("created_at", { ascending: false });

      if (leadId) query = query.eq("lead_id", leadId);
      if (projectId) query = query.eq("project_id", projectId);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && (!!leadId || !!projectId),
  });
}
