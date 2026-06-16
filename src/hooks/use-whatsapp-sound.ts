import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Plays a short "plop" sound only for new messages in WhatsApp sessions
 * owned by the current user.
 */
export function useWhatsAppSound() {
  const { user, organization } = useAuth();
  const lastPlayedRef = useRef<number>(0);
  const notifyAfterRef = useRef<number>(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ownedSessionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !organization?.id) return;
    notifyAfterRef.current = Date.now();

    const audio = new Audio("/sounds/whatsapp-pop.mp3");
    audio.volume = 0.4;
    audio.preload = "auto";
    audioRef.current = audio;

    const loadOwnedSessions = async () => {
      const { data } = await supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("owner_user_id", user.id)
        .eq("is_active", true);

      ownedSessionIds.current = new Set((data || []).map((session: any) => session.id));
    };

    loadOwnedSessions();

    const canHearMessage = (message: any): boolean => {
      return ownedSessionIds.current.has(message.session_id);
    };

    const isFreshRealtimeInsert = (createdAt?: string | null) => {
      if (!createdAt) return true;
      const createdTime = Date.parse(createdAt);
      if (Number.isNaN(createdTime)) return true;
      return createdTime >= notifyAfterRef.current - 5000;
    };

    const channel = supabase
      .channel(`whatsapp-sound-${user.id}-${organization.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
        },
        (payload) => {
          const message = payload.new as any;
          if (!message || message.from_me) return;
          if (!isFreshRealtimeInsert(message.created_at)) return;
          if (!canHearMessage(message)) return;

          const now = Date.now();
          if (now - lastPlayedRef.current < 1500) return;
          lastPlayedRef.current = now;

          audioRef.current?.play().catch(() => {});
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          notifyAfterRef.current = Date.now();
        }
      });

    const refreshInterval = setInterval(loadOwnedSessions, 2 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
      audioRef.current = null;
    };
  }, [user?.id, organization?.id]);
}
