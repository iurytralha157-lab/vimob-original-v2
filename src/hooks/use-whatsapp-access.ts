import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to check if the current user has access to any WhatsApp session.
 *
 * Access rules:
 * - Own sessions
 * - Explicit grants via whatsapp_session_access
 */
export function useHasWhatsAppAccess() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["whatsapp-access-check", profile?.id, profile?.organization_id, profile?.role],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id) return false;

      // Check if user owns any session
      const { data: ownedSessions, error: ownedError } = await supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("owner_user_id", profile.id)
        .limit(1);

      if (ownedError) {
        console.error("Error checking owned sessions:", ownedError);
      }

      if (ownedSessions && ownedSessions.length > 0) {
        return true;
      }

      // Check if user has been granted access to any session
      const { data: accessGrants, error: accessError } = await supabase
        .from("whatsapp_session_access")
        .select("id, session:whatsapp_sessions!whatsapp_session_access_session_id_fkey(organization_id)")
        .eq("user_id", profile.id)
        .eq("can_view", true)
        .limit(1);

      if (accessError) {
        console.error("Error checking session access:", accessError);
        return false;
      }

      // Filter by organization
      const hasAccess = accessGrants?.some(
        (grant: any) => grant.session?.organization_id === profile.organization_id,
      );

      return !!hasAccess;
    },
    enabled: !!profile?.id && !!profile?.organization_id,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
