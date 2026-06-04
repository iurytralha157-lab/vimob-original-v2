import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useConstructionProjects() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["construction-projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select(`
          *,
          property:properties(id, title)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });
}

export function useConstructionProject(id: string) {
  return useQuery({
    queryKey: ["construction-project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select(`
          *,
          property:properties(id, title)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateConstructionProject() {
  const queryClient = useQueryClient();
  const { organization, profile } = useAuth();

  return useMutation({
    mutationFn: async (values: any) => {
      const { data, error } = await supabase
        .from("construction_projects" as any)
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
      queryClient.invalidateQueries({ queryKey: ["construction-projects"] });
      toast.success("Obra criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar obra: ${error.message}`);
    }
  });
}

export function useUpdateConstructionProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      const { data, error } = await supabase
        .from("construction_projects")
        .update(values)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["construction-projects"] });
      queryClient.invalidateQueries({ queryKey: ["construction-project", data.id] });
      toast.success("Obra atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar obra: ${error.message}`);
    }
  });
}

export function useConstructionDiaries(projectId: string) {
  return useQuery({
    queryKey: ["construction-diaries", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_diaries" as any)
        .select(`
          *,
          created_by_profile:users!created_by(id, name, avatar_url)
        `)
        .eq("project_id", projectId)
        .order("entry_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useCreateConstructionDiary() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (values: any) => {
      const { data, error } = await supabase
        .from("construction_diaries" as any)
        .insert([{
          ...values,
          created_by: profile?.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["construction-diaries", variables.project_id] });
      toast.success("Diário registrado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar diário: ${error.message}`);
    }
  });
}

export function useConstructionMilestones(projectId: string) {
  return useQuery({
    queryKey: ["construction-milestones", projectId],
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

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      const { data, error } = await supabase
        .from("construction_milestones")
        .update(values)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["construction-milestones", data.project_id] });
      toast.success("Milestone atualizada!");
    },
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  const { organization, profile } = useAuth();

  return useMutation({
    mutationFn: async ({ items, ...orderData }: any) => {
      // 1. Criar a Ordem de Compra
      const { data: order, error: orderError } = await supabase
        .from("construction_purchase_orders")
        .insert([{
          ...orderData,
          organization_id: organization?.id,
          created_by: profile?.id,
          status: 'pending'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Criar os itens da Ordem
      if (items && items.length > 0) {
        const itemsWithOrder = items.map((item: any) => ({
          ...item,
          purchase_order_id: order.id
        }));

        const { error: itemsError } = await supabase
          .from("construction_purchase_order_items")
          .insert(itemsWithOrder);

        if (itemsError) throw itemsError;
      }

      return order;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["construction-purchase-orders", data.project_id] });
      toast.success("Ordem de compra gerada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao gerar ordem de compra: ${error.message}`);
    }
  });
}

export function useAllPurchaseOrders(dateRange?: { from: Date; to: Date }) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["all-purchase-orders", organization?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("construction_purchase_orders")
        .select(`
          *,
          project:construction_projects(id, name),
          supplier:suppliers(id, name)
        `)
        .eq("organization_id", organization?.id);

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });
}

export function useAllMilestones(dateRange?: { from: Date; to: Date }) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["all-milestones", organization?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("construction_milestones")
        .select(`
          *,
          project:construction_projects(id, name)
        `)
        .eq("organization_id", organization?.id);

      if (dateRange) {
        query = query
          .gte('start_date', dateRange.from.toISOString())
          .lte('start_date', dateRange.to.toISOString());
      }

      const { data, error } = await query.order("start_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });
}

