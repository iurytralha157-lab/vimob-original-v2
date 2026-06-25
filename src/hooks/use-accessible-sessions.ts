import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppSession } from "./use-whatsapp-sessions";

/**
 * Hook to get only WhatsApp sessions owned by the current user.
 */
export function useAccessibleSessions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["accessible-sessions", profile?.id, profile?.organization_id, profile?.role],
    queryFn: async (): Promise<WhatsAppSession[]> => {
      if (!profile?.id || !profile?.organization_id) {
        console.warn("[useAccessibleSessions] Missing profile data:", { 
          id: profile?.id, 
          org: profile?.organization_id 
        });
        return [];
      }

      console.log("[useAccessibleSessions] Fetching accessible sessions for:", {
        userId: profile.id,
        orgId: profile.organization_id,
        role: profile.role
      });

      const { data, error } = await supabase
        .from("whatsapp_sessions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("owner_user_id", profile.id);

      if (error) {
        console.error("[useAccessibleSessions] Error fetching sessions:", error);
        throw error;
      }

      console.log(`[useAccessibleSessions] Found ${data?.length || 0} accessible sessions`);
      
      const sessions = (data || []) as WhatsAppSession[];
      return sessions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!profile?.id && !!profile?.organization_id,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
