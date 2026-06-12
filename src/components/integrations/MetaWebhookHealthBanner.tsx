import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STATUS_LABELS: Record<string, string> = {
  failed: "falhas",
  skipped: "ignorados",
  duplicate: "duplicados",
};

export function MetaWebhookHealthBanner() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const { data } = useQuery({
    queryKey: ["meta-webhook-health", orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("meta_webhook_events")
        .select("status, error_message, received_at")
        .eq("organization_id", orgId!)
        .gte("received_at", since)
        .in("status", ["failed", "skipped"])
        .order("received_at", { ascending: false })
        .limit(200);

      if (error) {
        return { counts: {} as Record<string, number>, lastError: null as string | null, missing: true };
      }

      const counts: Record<string, number> = {};
      let lastError: string | null = null;
      for (const row of data || []) {
        counts[row.status] = (counts[row.status] || 0) + 1;
        if (!lastError && row.error_message) lastError = row.error_message;
      }

      return { counts, lastError, missing: false };
    },
  });

  if (!data || data.missing) return null;

  const failed = data.counts.failed || 0;
  const skipped = data.counts.skipped || 0;
  if (failed === 0 && skipped === 0) return null;

  const variant = failed > 0 ? "destructive" : "default";
  const Icon = failed > 0 ? AlertTriangle : AlertCircle;

  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} ${STATUS_LABELS.failed}`);
  if (skipped > 0) parts.push(`${skipped} ${STATUS_LABELS.skipped}`);

  return (
    <Alert variant={variant as any}>
      <Icon className="h-4 w-4" />
      <AlertTitle>Eventos Meta nos ultimos 7 dias</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          {parts.join(" e ")} no webhook do Meta.
          {skipped > 0 && " Leads ignorados normalmente significam formulario sem configuracao ativa."}
        </p>
        {data.lastError && <p className="text-xs opacity-80">Ultimo motivo: {data.lastError}</p>}
      </AlertDescription>
    </Alert>
  );
}
