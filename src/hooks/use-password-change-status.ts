import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PasswordChangeSource = "settings" | "recovery";

interface PasswordChangeEvent {
  changed_at: string;
  source: PasswordChangeSource;
}

interface PasswordChangeLockout {
  locked_until: string | null;
  lock_level: number;
  last_lock_reason: string | null;
}

const sourceLabels: Record<PasswordChangeSource, string> = {
  settings: "Configurações",
  recovery: "Recuperação de senha",
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function formatLastChange(event?: PasswordChangeEvent | null) {
  if (!event) return "Nenhuma alteração de senha registrada.";

  const date = new Date(event.changed_at);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const dateLabel = isToday
    ? "hoje"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeLabel = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return `Última alteração: ${dateLabel} às ${timeLabel} via ${sourceLabels[event.source]}.`;
}

export function usePasswordChangeStatus(userId?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ["password-change-status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [eventsResult, lockoutResult] = await Promise.all([
        (supabase as any)
          .from("password_change_events")
          .select("changed_at, source")
          .eq("user_id", userId)
          .order("changed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("password_change_lockouts")
          .select("locked_until, lock_level, last_lock_reason")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (lockoutResult.error) throw lockoutResult.error;

      return {
        lastChange: eventsResult.data as PasswordChangeEvent | null,
        lockout: lockoutResult.data as PasswordChangeLockout | null,
      };
    },
  });

  const lockedUntil = query.data?.lockout?.locked_until ? new Date(query.data.lockout.locked_until) : null;
  const isLocked = !!lockedUntil && lockedUntil.getTime() > now;

  useEffect(() => {
    if (!isLocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isLocked]);

  return useMemo(() => {
    const remainingMs = lockedUntil ? lockedUntil.getTime() - now : 0;
    return {
      ...query,
      lastChangeText: formatLastChange(query.data?.lastChange),
      isLocked,
      lockedUntil,
      remainingText: isLocked ? formatRemaining(remainingMs) : null,
      lockout: query.data?.lockout || null,
    };
  }, [isLocked, lockedUntil, now, query]);
}
