import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

function getLogStatusMeta(status: string | null | undefined) {
  switch (status) {
    case "sent":
      return {
        label: "Sucesso",
        className: "bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20",
        icon: CheckCircle2,
      };
    case "queued":
      return {
        label: "Enfileirado",
        className: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20",
        icon: Clock,
      };
    case "failed":
    case "error":
      return {
        label: "Falha",
        className: "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20",
        icon: AlertCircle,
      };
    default:
      return {
        label: status || "Pendente",
        className: "bg-muted text-muted-foreground hover:bg-muted border-border",
        icon: Clock,
      };
  }
}

export function NotificationLogsTable() {
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs" as any)
        .select(`
          *,
          notification_templates (
            name,
            slug
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-10 text-destructive">
        <AlertCircle className="mr-2 h-5 w-5" />
        <span>Erro ao carregar logs: {(error as Error).message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Destinatário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Execução</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum log encontrado.
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log: any) => {
                const statusMeta = getLogStatusMeta(log.status);
                const StatusIcon = statusMeta.icon;

                return (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-xs">{log.notification_templates?.name || 'N/A'}</div>
                    <div className="text-[10px] text-muted-foreground">{log.notification_templates?.slug || log.template_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {log.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate text-xs">
                    {log.recipient}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusMeta.className} text-[10px] h-5 gap-1`}>
                      <StatusIcon className="h-2 w-2" />
                      {statusMeta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {log.payload?.executionTime || 'N/A'}
                  </TableCell>
                  <TableCell>
                     {log.is_test && <Badge variant="secondary" className="text-[8px] h-4">Teste</Badge>}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedLog && (
        <div className="p-4 border rounded-md bg-muted/30 space-y-4 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Detalhes do Payload</h4>
            <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)} className="h-7 text-xs">Fechar</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Conteúdo Enviado</label>
              <div className="p-3 bg-background border rounded text-xs whitespace-pre-wrap font-sans">
                {selectedLog.payload?.formattedMessage || 'Sem conteúdo'}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Resposta Técnica / Erro</label>
              <pre className="p-3 bg-black text-green-400 border rounded text-[10px] overflow-auto max-h-[200px]">
                {JSON.stringify(selectedLog.response || selectedLog.error, null, 2)}
              </pre>
            </div>
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground border-t pt-2">
            <span>Dedupe Key: {selectedLog.dedupe_key || 'N/A'}</span>
            <span>ID: {selectedLog.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}
