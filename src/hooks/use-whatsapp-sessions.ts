import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";

/**
 * Evolution Go is the only provider enabled for new WhatsApp connections.
 * Legacy Evolution sessions may still exist in the database until they are migrated/deleted.
 */
export const EVOLUTION_GO_CREATION_ENABLED = true;
export const WHATSAPP_LEGACY_EVOLUTION_ENABLED = false;

export type WhatsAppProvider = "evolution" | "evolution_go";

export interface WhatsAppSession {
  id: string;
  organization_id: string;
  owner_user_id: string;
  instance_name: string;
  display_name: string | null;
  instance_id: string | null;
  status: string;
  phone_number: string | null;
  profile_name: string | null;
  profile_picture: string | null;
  is_active: boolean;
  is_notification_session?: boolean;
  provider?: WhatsAppProvider;
  advanced_settings?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  last_connected_at?: string | null;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface WhatsAppSessionAccess {
  id: string;
  session_id: string;
  user_id: string;
  can_view: boolean;
  can_send: boolean;
  only_leads_access: boolean;
  granted_by: string | null;
  created_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export function useWhatsAppSessions() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.organization_id) return;

    // Supabase Realtime subscription to reflect webhook updates immediately
    const channel = supabase
      .channel('whatsapp_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_sessions',
          filter: `organization_id=eq.${profile.organization_id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions", profile?.organization_id] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-session"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, queryClient]);

  return useQuery({
    queryKey: ["whatsapp-sessions", profile?.organization_id, profile?.id],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id) return [] as WhatsAppSession[];

      // Isolamento estrito: apenas conexÃµes cujo dono Ã© o prÃ³prio usuário,
      // dentro da organização ativa. NÃ£o hÃ¡ exceÃ§Ã£o para admin de organização.
      const { data, error } = await supabase
        .from("whatsapp_sessions")
        .select(`
          *,
          owner:users!whatsapp_sessions_owner_user_id_fkey(id, name, email)
        `)
        .eq("organization_id", profile.organization_id)
        .eq("owner_user_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map(session => ({
        ...session,
        display_name: (session as any).display_name || null,
        last_connected_at: (session as any).last_connected_at || null,
        is_notification_session: (session as any).is_notification_session || false,
      })) as WhatsAppSession[];
    },
    enabled: !!profile?.organization_id && !!profile?.id,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });
}

export function useWhatsAppSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["whatsapp-session", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from("whatsapp_sessions")
        .select(`
          *,
          owner:users!whatsapp_sessions_owner_user_id_fkey(id, name, email)
        `)
        .eq("id", sessionId)
        .single();

      if (error) throw error;
      return {
        ...data,
        display_name: (data as any).display_name || null,
        last_connected_at: (data as any).last_connected_at || null,
      } as WhatsAppSession;
    },
    enabled: !!sessionId,
  });
}

export function useSessionAccess(sessionId: string | null) {
  return useQuery({
    queryKey: ["whatsapp-session-access", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from("whatsapp_session_access")
        .select(`
          *,
          user:users!whatsapp_session_access_user_id_fkey(id, name, email)
        `)
        .eq("session_id", sessionId);

      if (error) throw error;
      return data as WhatsAppSessionAccess[];
    },
    enabled: !!sessionId,
  });
}

export function useCreateWhatsAppSession() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (
      input: string | { displayName: string; provider?: WhatsAppProvider },
    ) => {
      if (!profile?.organization_id || !profile?.id) {
        throw new Error("User not authenticated");
      }
      const displayName = typeof input === "string" ? input : input.displayName;
      const requestedProvider: WhatsAppProvider =
        typeof input === "string" ? "evolution_go" : input.provider || "evolution_go";
      const provider: WhatsAppProvider = "evolution_go";

      if (requestedProvider !== "evolution_go") {
        console.warn("Legacy Evolution creation is disabled. Forcing Evolution Go.");
      }

      const { data: organization, error: orgError } = await supabase
        .from("organizations")
        .select("plan_id, max_whatsapp_sessions_override")
        .eq("id", profile.organization_id)
        .single();

      if (orgError) throw orgError;

      let maxWhatsAppSessions: number | null | undefined = (organization as any)?.max_whatsapp_sessions_override;

      if ((maxWhatsAppSessions === null || maxWhatsAppSessions === undefined) && organization?.plan_id) {
        const { data: plan, error: planError } = await supabase
          .from("admin_subscription_plans")
          .select("max_whatsapp_sessions")
          .eq("id", organization.plan_id)
          .single();

        if (planError) {
          console.warn("[useCreateWhatsAppSession] Could not read plan WhatsApp limit:", planError);
        }

        maxWhatsAppSessions = plan?.max_whatsapp_sessions;
      }

      if (typeof maxWhatsAppSessions === "number" && maxWhatsAppSessions > 0) {
        const { count, error: countError } = await supabase
          .from("whatsapp_sessions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", profile.organization_id)
          .eq("is_active", true);

        if (countError) throw countError;

        if ((count || 0) >= maxWhatsAppSessions) {
          throw new Error(`Limite do plano atingido: máximo de ${maxWhatsAppSessions} WhatsApp${maxWhatsAppSessions === 1 ? "" : "s"}.`);
        }
      }

      // Generate unique instance name: {sanitized_name}_{org_prefix}_{random_suffix}
      const orgPrefix = profile.organization_id.substring(0, 5);
      const randomSuffix = Math.random().toString(36).substring(2, 5);
      const sanitizedName = displayName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 20);
      const uniqueInstanceName = `${sanitizedName}_${orgPrefix}_${randomSuffix}`;

      // Generate a unique token for evolution_go to identify the instance
      const token = provider === "evolution_go" ? Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) : null;

      console.log("[useCreateWhatsAppSession] Inserting new session:", {
        organization_id: profile.organization_id,
        owner_user_id: profile.id,
        instance_name: uniqueInstanceName,
        display_name: displayName,
        provider
      });

      // Create session row first
      const { data: session, error: dbError } = await supabase
        .from("whatsapp_sessions")
        .insert({
          organization_id: profile.organization_id,
          owner_user_id: profile.id,
          instance_name: uniqueInstanceName,
          display_name: displayName,
          status: "disconnected",
          provider,
          advanced_settings: { token },
        })
        .select()
        .single();

      if (dbError) {
        console.error("[useCreateWhatsAppSession] Database error:", dbError);
        throw dbError;
      }

      // Provision instance on the chosen provider
      const proxyFn = "evolution-go-proxy";
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-go-webhook`;

      const body = {
        action: "instance.create",
        body: { name: uniqueInstanceName, token },
      };

      const { data: result, error: fnError } = await supabase.functions.invoke(proxyFn, { body });

      if (fnError) {
        await supabase.from("whatsapp_sessions").delete().eq("id", session.id);
        throw fnError;
      }

      const failed = !result?.ok;
      if (failed) {
        await supabase.from("whatsapp_sessions").delete().eq("id", session.id);
        const msg =
          result?.error ||
          result?.data?.error?.message ||
          result?.data?.message ||
          result?.data?.error ||
          "Failed to create instance";
        throw new Error(msg);
      }

      // Persist instance_id (UUID) if returned by either provider
      const evoId: string | undefined =
        result?.data?.data?.id || 
        result?.data?.instance?.id || 
        result?.data?.id ||
        (result?.data as any)?.instance?.uuid;
      const createNotificationSafeApplied =
        result?.notificationSafeSettings?.ok === true
          ? { notification_safe_settings_applied_at: new Date().toISOString() }
          : {};

      if (evoId) {
        await supabase
          .from("whatsapp_sessions")
          .update({ 
            instance_id: evoId,
            advanced_settings: {
              ...((session as any).advanced_settings || {}),
              token,
              ...createNotificationSafeApplied,
            }
          })
          .eq("id", session.id);
        (session as any).instance_id = evoId;
        (session as any).advanced_settings = {
          ...((session as any).advanced_settings || {}),
          token,
          ...createNotificationSafeApplied,
        };
      }

      const configuredWebhookUrl = `${webhookUrl}?session_id=${session.id}&instance_id=${evoId || ""}`;
      const { data: connectResult } = await supabase.functions.invoke("evolution-go-proxy", {
        body: {
          action: "instance.connect",
          session_id: session.id,
          instance_id: evoId,
          token,
          body: { 
            webhookUrl: configuredWebhookUrl, 
            subscribe: ["ALL"], 
            immediate: true 
          },
        },
      });

      const notificationSafeApplied =
        connectResult?.notificationSafeSettings?.ok === true
          ? { notification_safe_settings_applied_at: new Date().toISOString() }
          : {};

      await supabase
        .from("whatsapp_sessions")
        .update({
          advanced_settings: {
            ...((session as any).advanced_settings || {}),
            token,
            webhook_url: configuredWebhookUrl,
            webhook_last_configured_at: new Date().toISOString(),
            ...notificationSafeApplied,
          },
        })
        .eq("id", session.id);


      return {
        session: {
          ...session,
          display_name: (session as any).display_name || displayName,
        } as WhatsAppSession,
        evolutionData: result.data,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
      toast({
        title: "Sessão criada",
        description: "Escaneie o QR Code para conectar",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar sessão",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteWhatsAppSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: WhatsAppSession) => {
      // Try to delete from Evolution API first
      try {
        if (session.provider !== "evolution_go") {
          throw new Error("Evolution legada esta desativada.");
        }
        
        await supabase.functions.invoke("evolution-go-proxy", {
          body: {
            action: "instance.delete",
            instanceName: session.instance_name,
            instance_id: session.instance_id,
          },
        });
      } catch (e) {
        console.warn("Evolution API delete failed (proceeding with DB delete):", e);
      }

      // Always delete from database
      const { error } = await supabase
        .from("whatsapp_sessions")
        .delete()
        .eq("id", session.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
      toast({
        title: "Sessão excluída",
        description: "A conexão WhatsApp foi removida",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir sessão",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useGetQRCode() {
  return useMutation({
    mutationFn: async (
      arg: string | { provider: WhatsAppProvider; instanceName: string; sessionId?: string; instanceId?: string | null },
    ) => {
      // Legacy: string => evolution-proxy
      if (typeof arg === "string") {
        throw new Error("Evolution legada esta desativada. Crie uma nova conexao Evolution Go.");
      }

      if (arg.provider === "evolution_go") {
        const { data, error } = await supabase.functions.invoke("evolution-go-proxy", {
          body: { action: "instance.qr", session_id: arg.sessionId, instance_id: arg.instanceId ?? undefined },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Failed to get QR code");
        const qr = data?.data?.data?.qrcode ?? data?.data?.qrcode ?? data?.data?.Qrcode ?? null;
        return { base64: qr, qrcode: qr };
      }

      throw new Error("Evolution legada esta desativada. Crie uma nova conexao Evolution Go.");
    },
  });
}

export function useGetConnectionStatus() {
  return useMutation({
    mutationFn: async (
      arg: string | { provider: WhatsAppProvider; instanceName: string; sessionId?: string; instanceId?: string | null },
    ) => {
      if (typeof arg === "string") {
        throw new Error("Evolution legada esta desativada. Crie uma nova conexao Evolution Go.");
      }

      if (arg.provider === "evolution_go") {
        const { data, error } = await supabase.functions.invoke("evolution-go-proxy", {
          body: { action: "instance.status", session_id: arg.sessionId, instance_id: arg.instanceId ?? undefined },
        });
        
        if (error) throw error;
        
        // If not OK, but we have a data object (like 404), handle it
        if (!data?.ok) {
          if (data?.status === 404 || data?.data?.status === 404) {
            return { connected: false, status: "disconnected", instanceNotFound: true };
          }
          throw new Error(data?.error || "Failed to get status");
        }

        const normalizedStatus = data?.normalizedStatus || "disconnected";
        const isConnected = normalizedStatus === "connected";
        const rawData = data?.data?.data ?? data?.data ?? {};

        return {
          connected: isConnected,
          status: normalizedStatus,
          state: isConnected ? "open" : (normalizedStatus === "qr_ready" ? "qr" : "close"),
          instance: { wuid: rawData.jid || rawData.Name || null },
          rawResponse: data?.rawResponse,
          rawStatus: data?.rawStatus
        };
      }

      throw new Error("Evolution legada esta desativada. Crie uma nova conexao Evolution Go.");
    },
  });
}


export function useSetWebhook() {
  return useMutation({
    mutationFn: async ({ instanceName, webhookUrl }: { instanceName: string; webhookUrl: string }) => {
      throw new Error("Evolution legada esta desativada. Webhook deve usar evolution-go-webhook.");
    },
  });
}

export type WhatsAppAccessMode =
  | "assigned_leads_only"
  | "team_leads"
  | "all_leads"
  | "full_inbox";

export function useGrantSessionAccess() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      sessionId,
      userId,
      canView = true,
      canSend = true,
      accessMode = "assigned_leads_only",
    }: {
      sessionId: string;
      userId: string;
      canView?: boolean;
      canSend?: boolean;
      accessMode?: WhatsAppAccessMode;
    }) => {
      const { error } = await supabase.from("whatsapp_session_access").upsert(
        {
          session_id: sessionId,
          user_id: userId,
          can_view: canView,
          can_send: canSend,
          access_mode: accessMode,
          granted_by: profile?.id,
        } as any,
        { onConflict: "session_id,user_id" }
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-session-access", variables.sessionId] });
      toast({
        title: "Acesso atualizado",
        description: "Permissões salvas com sucesso",
      });
    },
  });
}

export function useRevokeSessionAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, userId }: { sessionId: string; userId: string }) => {
      const { error } = await supabase
        .from("whatsapp_session_access")
        .delete()
        .eq("session_id", sessionId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-session-access", variables.sessionId] });
      toast({
        title: "Acesso revogado",
        description: "O usuário não tem mais acesso à sessão",
      });
    },
  });
}

export function useRecreateWhatsAppInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: WhatsAppSession) => {
      if (session.provider !== "evolution_go") {
        throw new Error("Evolution legada esta desativada. Exclua esta sessao e crie uma nova Evolution Go.");
      }

      const token = (session.advanced_settings as any)?.token || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { data: result, error: fnError } = await supabase.functions.invoke("evolution-go-proxy", {
        body: {
          action: "instance.create",
          body: { name: session.instance_name, token },
        },
      });

      if (fnError) throw fnError;

      if (!result?.ok) {
        throw new Error(result.error || "Failed to recreate instance");
      }

      const evoId: string | undefined =
        result?.data?.data?.id ||
        result?.data?.instance?.id ||
        result?.data?.id ||
        (result?.data as any)?.instance?.uuid;
      const createNotificationSafeApplied =
        result?.notificationSafeSettings?.ok === true
          ? { notification_safe_settings_applied_at: new Date().toISOString() }
          : {};

      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-go-webhook`;
      const configuredWebhookUrl = `${webhookUrl}?session_id=${session.id}&instance_id=${evoId || ""}`;
      const { data: connectResult } = await supabase.functions.invoke("evolution-go-proxy", {
        body: {
          action: "instance.connect",
          session_id: session.id,
          instance_id: evoId,
          token,
          body: {
            webhookUrl: configuredWebhookUrl,
            subscribe: ["ALL"],
            immediate: true,
          },
        },
      });

      const notificationSafeApplied =
        connectResult?.notificationSafeSettings?.ok === true
          ? { notification_safe_settings_applied_at: new Date().toISOString() }
          : {};

      // Update database status to disconnected (ready to scan QR)
      await supabase
        .from("whatsapp_sessions")
        .update({
          status: "disconnected",
          instance_id: evoId,
          advanced_settings: {
            ...(session.advanced_settings || {}),
            token,
            webhook_url: configuredWebhookUrl,
            webhook_last_configured_at: new Date().toISOString(),
            ...createNotificationSafeApplied,
            ...notificationSafeApplied,
          },
        })
        .eq("id", session.id);

      return { session, evolutionData: result.data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
      toast({
        title: "Instância recriada",
        description: "Escaneie o QR Code para conectar",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao recriar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useLogoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: WhatsAppSession) => {
      if (session.provider !== "evolution_go") {
        throw new Error("Evolution legada esta desativada. Exclua esta sessao e crie uma nova Evolution Go.");
      }

      const { data, error } = await supabase.functions.invoke("evolution-go-proxy", {
        body: {
          action: "instance.logout",
          session_id: session.id,
          instance_id: session.instance_id ?? undefined,
        },
      });

      if (error) throw error;

      // Update status in database
      await supabase
        .from("whatsapp_sessions")
        .update({ status: "disconnected" })
        .eq("id", session.id);

      // Send system notification for disconnection
      try {
        const { notificationService } = await import('@/services/NotificationService');
        await notificationService.send({
          eventKey: 'whatsapp_disconnected',
          organizationId: session.organization_id,
          userId: session.owner_user_id,
          variables: {
            session_name: session.display_name || session.instance_name,
            display_name: session.display_name || session.instance_name
          }
        });
      } catch (err) {
        console.error('Disconnection notification failed:', err);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
      toast({
        title: "Desconectado",
        description: "A sessão foi desconectada",
      });
    },
  });
}

// Hook for QR Code polling until connected
export function useQRCodePolling(session: WhatsAppSession | null) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [needsRecreate, setNeedsRecreate] = useState(false);
  const queryClient = useQueryClient();
  const getQRCode = useGetQRCode();
  const getStatus = useGetConnectionStatus();

  const startPolling = useCallback(async () => {
    if (!session || isPolling) return;
    
    setIsPolling(true);
    setNeedsRecreate(false);
    
    const pollQRCode = async () => {
      try {
        const provider = (session.provider || "evolution_go") as WhatsAppProvider;
        const arg = {
          provider,
          instanceName: session.instance_name,
          sessionId: session.id,
          instanceId: session.instance_id,
        };

        // Check connection status first
        const status = await getStatus.mutateAsync(arg);

        // Check if instance doesn't exist in Evolution API
        if (status?.instanceNotFound) {
          console.log("Instance not found in Evolution API, needs recreation");
          setConnectionStatus("instance_not_found");
          setNeedsRecreate(true);
          setIsPolling(false);
          return true; // Stop polling
        }

        const isConnected = status?.connected === true || status?.state === "open";

        if (isConnected) {
          setConnectionStatus("connected");
          setQrCode(null);
          setIsPolling(false);

          // Update database status
          await supabase
            .from("whatsapp_sessions")
            .update({
              status: "connected",
              phone_number: status?.instance?.wuid?.split("@")[0] || null,
              last_connected_at: new Date().toISOString()
            })
            .eq("id", session.id);

          queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
          return true;
        }

        // Get QR Code
        const qrData = await getQRCode.mutateAsync(arg);

        if (qrData?.qrcode) {
          setQrCode(qrData.qrcode);
          setConnectionStatus("waiting_qr");
        } else if (qrData?.base64) {
          setQrCode(qrData.base64);
          setConnectionStatus("waiting_qr");
        }

        return false;
      } catch (error) {
        console.error("Polling error:", error);
        return false;
      }
    };


    // Initial poll
    const connected = await pollQRCode();
    
    if (!connected && !needsRecreate) {
      // Continue polling every 3 seconds
      const interval = setInterval(async () => {
        const isConnected = await pollQRCode();
        if (isConnected || needsRecreate) {
          clearInterval(interval);
        }
      }, 3000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(interval);
        setIsPolling(false);
      }, 120000);
    }
  }, [session, isPolling, getQRCode, getStatus, queryClient, needsRecreate]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    setQrCode(null);
    setNeedsRecreate(false);
  }, []);

  useEffect(() => {
    return () => {
      setIsPolling(false);
    };
  }, []);

  return {
    qrCode,
    isPolling,
    connectionStatus,
    startPolling,
    stopPolling,
    needsRecreate,
  };
}

export function useToggleNotificationSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, enabled }: { sessionId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_sessions")
        .update({ is_notification_session: enabled } as any)
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
      toast({
        title: "Configuração atualizada",
        description: "Sessão de notificação alterada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
