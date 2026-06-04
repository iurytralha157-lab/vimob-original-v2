import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface MetaFormQuestion {
  key: string;
  label: string;
  type: string;
}

export interface MetaForm {
  id: string;
  name: string;
  status: string;
  leads_count?: number;
  questions?: MetaFormQuestion[];
}

export interface MetaFormConfig {
  id: string;
  organization_id: string;
  integration_id: string;
  form_id: string;
  form_name: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  default_status: string | null;
  assigned_user_id: string | null;
  round_robin_id?: string | null;
  property_id: string | null;
  purpose?: string | null;
  source?: string | null;
  source_details?: string | null;
  default_values?: Record<string, unknown>;
  created_by?: string | null;
  created_by_name?: string | null;
  auto_tags: string[];
  field_mapping: Record<string, string>;
  custom_fields_config: string[];
  is_active: boolean;
  leads_received: number;
  last_lead_at: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch form configurations for an integration
export function useMetaFormConfigs(integrationId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["meta-form-configs", integrationId],
    queryFn: async () => {
      if (!profile?.organization_id || !integrationId) return [];

      const { data, error } = await (supabase as any)
        .from("meta_form_configs")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("integration_id", integrationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const creatorIds = [...new Set((data || []).map((config: any) => config.created_by).filter(Boolean))];
      const { data: creators } = creatorIds.length
        ? await (supabase as any)
            .from("users")
            .select("id,name,email")
            .in("id", creatorIds)
        : { data: [] };
      const creatorsById = new Map((creators || []).map((user: any) => [user.id, user.name || user.email]));

      return (data || []).map((config: any) => ({
        ...config,
        created_by_name: config.created_by ? creatorsById.get(config.created_by) || null : null,
        auto_tags: Array.isArray(config.auto_tags) ? config.auto_tags : [],
        field_mapping: typeof config.field_mapping === 'object' ? config.field_mapping : {},
        custom_fields_config: Array.isArray(config.custom_fields_config) ? config.custom_fields_config : [],
        default_values: typeof config.default_values === 'object' && config.default_values ? config.default_values : {},
      })) as MetaFormConfig[];
    },
    enabled: !!profile?.organization_id && !!integrationId,
  });
}

// Fetch all form configurations for the organization
export function useAllMetaFormConfigs() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["meta-form-configs", "all", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await (supabase as any)
        .from("meta_form_configs")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const creatorIds = [...new Set((data || []).map((config: any) => config.created_by).filter(Boolean))];
      const { data: creators } = creatorIds.length
        ? await (supabase as any)
            .from("users")
            .select("id,name,email")
            .in("id", creatorIds)
        : { data: [] };
      const creatorsById = new Map((creators || []).map((user: any) => [user.id, user.name || user.email]));

      return (data || []).map((config: any) => ({
        ...config,
        created_by_name: config.created_by ? creatorsById.get(config.created_by) || null : null,
        auto_tags: Array.isArray(config.auto_tags) ? config.auto_tags : [],
        field_mapping: typeof config.field_mapping === 'object' ? config.field_mapping : {},
        custom_fields_config: Array.isArray(config.custom_fields_config) ? config.custom_fields_config : [],
        default_values: typeof config.default_values === 'object' && config.default_values ? config.default_values : {},
      })) as MetaFormConfig[];
    },
    enabled: !!profile?.organization_id,
  });
}

// Fetch forms from Meta Graph API via edge function
export function useFetchPageForms() {
  return useMutation({
    mutationFn: async ({ pageId, accessToken }: { pageId: string; accessToken: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({
            action: "get_page_forms",
            page_id: pageId,
            access_token: accessToken,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch forms");
      }

      return response.json() as Promise<{ forms: MetaForm[] }>;
    },
  });
}

// Create or update form configuration
// NOTE: pipeline_id, stage_id, default_status, assigned_user_id are LEGACY fields
// Distribution is now handled by Round Robin in GestÃ£o CRM
export function useSaveFormConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: {
      integrationId: string;
      formId: string;
      formName?: string;
      propertyId?: string;
      roundRobinId?: string | null;
      purpose?: string | null;
      source?: string | null;
      sourceDetails?: string | null;
      defaultValues?: Record<string, unknown>;
      autoTags?: string[];
      fieldMapping?: Record<string, string>;
      customFieldsConfig?: string[];
      isActive?: boolean;
    }) => {
      if (!profile?.organization_id) throw new Error("No organization");

      const { data, error } = await (supabase as any)
        .from("meta_form_configs")
        .upsert({
          organization_id: profile.organization_id,
          integration_id: config.integrationId,
          form_id: config.formId,
          form_name: config.formName,
          pipeline_id: null,
          stage_id: null,
          default_status: null,
          assigned_user_id: null,
          round_robin_id: config.roundRobinId || null,
          property_id: config.propertyId || null,
          purpose: config.purpose || null,
          source: config.source || null,
          source_details: config.sourceDetails || null,
          default_values: config.defaultValues || {},
          auto_tags: config.autoTags || [],
          field_mapping: config.fieldMapping || {},
          custom_fields_config: config.customFieldsConfig || [],
          created_by: profile.id,
          is_active: config.isActive !== false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "organization_id,form_id",
        })
        .select()
        .single();

      if (error) throw error;

      await (supabase as any)
        .from("round_robin_rules")
        .delete()
        .eq("match_type", "meta_form")
        .eq("match_value", config.formId);

      if (config.roundRobinId) {
        const { error: ruleError } = await (supabase as any)
          .from("round_robin_rules")
          .insert({
            round_robin_id: config.roundRobinId,
            match_type: "meta_form",
            match_value: config.formId,
            match: { meta_form_id: [config.formId] },
            priority: 100,
            is_active: true,
          });

        if (ruleError) throw ruleError;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs", variables.integrationId] });
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs"] });
      queryClient.invalidateQueries({ queryKey: ["round-robin-rules"] });
      toast.success("Configuracao do formulario salva!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });
}
// Toggle form active status
export function useToggleFormConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ formId, isActive, integrationId }: { formId: string; isActive: boolean; integrationId: string }) => {
      const { error } = await (supabase as any)
        .from("meta_form_configs")
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq("form_id", formId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs", variables.integrationId] });
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs"] });
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}

// Delete form configuration
export function useDeleteFormConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ formId, integrationId }: { formId: string; integrationId: string }) => {
      const { error } = await (supabase as any)
        .from("meta_form_configs")
        .delete()
        .eq("form_id", formId);

      if (error) throw error;

      await (supabase as any)
        .from("round_robin_rules")
        .delete()
        .eq("match_type", "meta_form")
        .eq("match_value", formId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs", variables.integrationId] });
      queryClient.invalidateQueries({ queryKey: ["meta-form-configs"] });
      queryClient.invalidateQueries({ queryKey: ["round-robin-rules"] });
      toast.success("Configuracao removida!");
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}
