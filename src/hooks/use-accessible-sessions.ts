import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppSession } from "./use-whatsapp-sessions";

/**
 * Hook to get only WhatsApp sessions that the current user can access conversations for.
 * 
 * - All users see only:
 *   - Sessions they own (owner_user_id)
 *   - Sessions they have explicit access to via whatsapp_session_access (can_view=true)
 *
 * NOTE: The whatsapp_session_access RLS has a circular dependency with whatsapp_sessions.
 * To work around this, we use two separate queries for regular users:
 * 1. Fetch owned sessions (bypasses access grant check)
 * 2. Fetch session_ids from access grants using only user_id filter
 * 3. Fetch those sessions by ID
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

      // We trust the RLS policy 'whatsapp_sessions_select_accessible' to return
      // only sessions the user is allowed to see (owned or shared).
      const { data, error } = await supabase
        .from("whatsapp_sessions")
        .select("*")
        .eq("organization_id", profile.organization_id);

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
