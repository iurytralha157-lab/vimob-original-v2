import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to check if the current user has access to any WhatsApp session.
 *
 * Access rules:
 * - Own sessions only.
 */
export function useHasWhatsAppAccess() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["whatsapp-access-check", profile?.id, profile?.organization_id, profile?.role],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id) return false;

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

      return false;
    },
    enabled: !!profile?.id && !!profile?.organization_id,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
