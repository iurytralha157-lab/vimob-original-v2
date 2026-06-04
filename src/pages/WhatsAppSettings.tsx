import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Smartphone, 
  QrCode, 
  Trash2, 
  LogOut, 
  Users, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Bug
} from "lucide-react";
import { 
  useWhatsAppSessions, 
  useCreateWhatsAppSession, 
  useDeleteWhatsAppSession,
  useGetQRCode,
  useGetConnectionStatus,
  useLogoutSession,
  useSessionAccess,
  useGrantSessionAccess,
  useRevokeSessionAccess,
  WhatsAppSession,
  useRecreateWhatsAppInstance
} from "@/hooks/use-whatsapp-sessions";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function WhatsAppSettings() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useWhatsAppSessions();
  const { data: users } = useOrganizationUsers();
  const createSession = useCreateWhatsAppSession();
  const deleteSession = useDeleteWhatsAppSession();
  const getQRCode = useGetQRCode();
  const getConnectionStatus = useGetConnectionStatus();
  const logoutSession = useLogoutSession();
  const recreateInstance = useRecreateWhatsAppInstance();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [selectedSession, setSelectedSession] = useState<WhatsAppSession | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isRefreshingQr, setIsRefreshingQr] = useState(false);
  const [verifyingSessionId, setVerifyingSessionId] = useState<string | null>(null);
  const [instanceNotFound, setInstanceNotFound] = useState(false);
  const [debugResults, setDebugResults] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

  // Refs para evitar stale closures no polling
  const selectedSessionRef = useRef(selectedSession);
  const qrDialogOpenRef = useRef(qrDialogOpen);
  
  useEffect(() => {
    selectedSessionRef.current = selectedSession;
    qrDialogOpenRef.current = qrDialogOpen;
  }, [selectedSession, qrDialogOpen]);

  // Function to check connection via Evolution API
  const checkConnection = useCallback(async (instanceName: string, sessionId: string): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "getConnectionStatus", instanceName },
      });

      if (error) throw error;
      if (!data?.success) return null;

      const result = data.data;
      console.log("checkConnection result:", result);
      
      // Evolution API returns state: "open" when connected.
      // We are very strict: only "open" counts as connected.
      const isConnected = 
        result?.state === "open" ||
        result?.connected === true;
      
      if (isConnected) {
        // Update status in database
        const { error: updateError } = await supabase
          .from("whatsapp_sessions")
          .update({ 
            status: "connected", 
            phone_number: result?.instance?.wuid?.split("@")[0] || null,
            last_health_check: new Date().toISOString(),
            health_check_failures: 0
          })
          .eq("id", sessionId);
        
        if (updateError) {
          console.error("Failed to update session status:", updateError);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.log("Polling check failed:", error);
      return null;
    }
  }, []);

  // Verificar conexão manualmente (botão "Verificar")
  const handleVerifyConnection = async (session: WhatsAppSession) => {
    setVerifyingSessionId(session.id);
    
    try {
      const connected = await checkConnection(session.instance_name, session.id);
      
      if (connected === true) {
        toast({ 
          title: "✅ Conectado!", 
          description: "WhatsApp está online" 
        });
      } else if (connected === null) {
        // Error checking - don't change DB status
        toast({ 
          title: "⚠️ Não foi possível verificar", 
          description: "Tente novamente em alguns segundos" 
        });
      } else {
        // Retry once before marking disconnected
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryResult = await checkConnection(session.instance_name, session.id);
        
        if (retryResult === true) {
          toast({ 
            title: "✅ Conectado!", 
            description: "WhatsApp está online" 
          });
        } else {
          await supabase
            .from("whatsapp_sessions")
            .update({ status: "disconnected" })
            .eq("id", session.id);
          toast({ 
            title: "⚠️ Desconectado", 
            description: "WhatsApp não está conectado" 
          });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
    } catch (error) {
      console.error("Error verifying connection:", error);
      toast({ 
        title: "Erro", 
        description: "Não foi possível verificar a conexão",
        variant: "destructive"
      });
    } finally {
      setVerifyingSessionId(null);
    }
  };

  // Polling para verificar conexão automaticamente quando o QR dialog está aberto
  useEffect(() => {
    if (!qrDialogOpen || !selectedSession) return;
    
    const pollInterval = setInterval(async () => {
      if (!qrDialogOpenRef.current || !selectedSessionRef.current) {
        clearInterval(pollInterval);
        return;
      }
      
      const connected = await checkConnection(
        selectedSessionRef.current.instance_name, 
        selectedSessionRef.current.id
      );
      
      if (connected === true) {
        toast({ 
          title: "Conectado!", 
          description: "WhatsApp conectado com sucesso" 
        });
        setQrDialogOpen(false);
        setQrCode(null);
        queryClient.invalidateQueries({ queryKey: ["whatsapp-sessions"] });
        clearInterval(pollInterval);
      } else {
        // If not connected, we keep the QR code visible. 
        // The checkConnection function already handles the DB update if it's connected.
        // We only refresh the QR if it's explicitly needed by the user.
      }
    }, 4000); // Poll every 4 seconds for better responsiveness
    
    // Limpar interval ao fechar o dialog
    return () => clearInterval(pollInterval);
  }, [qrDialogOpen, selectedSession?.id, checkConnection, queryClient]);
  const handleCreateSession = async () => {
    if (!instanceName.trim()) return;

    try {
      const result = await createSession.mutateAsync(instanceName.trim());
      setCreateDialogOpen(false);
      setInstanceName("");
      
      // Open QR dialog
      setSelectedSession(result.session);
      setQrDialogOpen(true);
      
      // Get QR code (webhook is now configured in startSession)
      await refreshQRCode(instanceName.trim());
    } catch (error) {
      console.error("Error creating session:", error);
    }
  };

  const refreshQRCode = async (instanceName: string) => {
    setIsRefreshingQr(true);
    setInstanceNotFound(false);
    try {
      const data = await getQRCode.mutateAsync(instanceName);
      // Handle different response formats from WPPConnect
      if ((data as any)?.qrcode) {
        setQrCode((data as any).qrcode);
      } else if ((data as any)?.base64) {
        setQrCode((data as any).base64);
      } else {
        console.log("QR Code response:", data);
      }
    } catch (error) {
      console.error("Error getting QR code:", error);
      // Check if error indicates instance doesn't exist
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("does not exist") || errorMessage.includes("Failed to get QR code")) {
        setInstanceNotFound(true);
      }
    } finally {
      setIsRefreshingQr(false);
    }
  };

  const checkConnectionStatus = async (session: WhatsAppSession) => {
    try {
      const data = await getConnectionStatus.mutateAsync(session.instance_name);
      if (data?.state === "open") {
        toast({
          title: "Conectado!",
          description: "WhatsApp conectado com sucesso",
        });
        setQrDialogOpen(false);
        setQrCode(null);
      }
    } catch (error) {
      console.error("Error checking status:", error);
    }
  };

  const handleOpenQRDialog = async (session: WhatsAppSession) => {
    setSelectedSession(session);
    setQrDialogOpen(true);
    setInstanceNotFound(false);
    await refreshQRCode(session.instance_name);
  };

  const handleRecreateInstance = async () => {
    if (!selectedSession) return;
    
    try {
      await recreateInstance.mutateAsync(selectedSession);
      setInstanceNotFound(false);
      // After recreation, get the new QR code
      await refreshQRCode(selectedSession.instance_name);
    } catch (error) {
      console.error("Error recreating instance:", error);
    }
  };

  const handleOpenAccessDialog = (session: WhatsAppSession) => {
    setSelectedSession(session);
    setAccessDialogOpen(true);
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    await deleteSession.mutateAsync(selectedSession);
    setDeleteDialogOpen(false);
    setSelectedSession(null);
  };

  const handleLogout = async (session: WhatsAppSession) => {
    await logoutSession.mutateAsync(session);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copiado!",
      description: "URL do webhook copiada para a área de transferência",
    });
  };

  const handleDebugInstances = async (session: WhatsAppSession) => {
    setSelectedSession(session);
    setDebugDialogOpen(true);
    setDebugResults(null);
    setDebugLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("evolution-go-proxy", {
        body: {
          action: "debug.instances",
          instance_id: session.instance_id || session.instance_name,
        },
      });

      console.log("Debug Evolution Instances:", data);
      if (error) {
        console.error("Erro:", error);
        setDebugResults({ error: error.message || String(error) });
      } else {
        setDebugResults(data);
      }
    } catch (err: any) {
      console.error("Erro:", err);
      setDebugResults({ error: err.message || String(err) });
    } finally {
      setDebugLoading(false);
    }
  };

  const copyDebugResults = () => {
    if (debugResults) {
      navigator.clipboard.writeText(JSON.stringify(debugResults, null, 2));
      toast({
        title: "Copiado!",
        description: "Resultados copiados para a área de transferência",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-orange-500 hover:bg-orange-600"><CheckCircle className="w-3 h-3 mr-1" />Conectado</Badge>;
      case "connecting":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Conectando</Badge>;
      default:
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Desconectado</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Conexões WhatsApp</h1>
            <p className="text-muted-foreground">
              Gerencie suas conexões de WhatsApp via Evolution API
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => sessions?.[0] && handleDebugInstances(sessions[0])}
              disabled={!sessions?.length || debugLoading}
              className="text-blue-500 hover:text-blue-600 border-blue-200"
            >
              <Bug className="w-4 h-4 mr-2" />
              Debug Evolution
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Conexão
            </Button>
          </div>
        </div>

        {/* Webhook Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">URL do Webhook</CardTitle>
            <CardDescription>
              Configure esta URL na sua instância Evolution API para receber mensagens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sessions List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma conexão</h3>
              <p className="text-muted-foreground text-center mb-4">
                Conecte seu primeiro WhatsApp para começar a receber mensagens
              </p>
              <Button data-tour="whatsapp-new-session" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Conectar WhatsApp
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions?.map((session) => (
              <Card key={session.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={session.profile_picture || undefined} />
                        <AvatarFallback>
                          <Smartphone className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{session.instance_name}</CardTitle>
                        <CardDescription>
                          {session.status === "connected" 
                            ? (session.phone_number || session.profile_name || "Conectado") 
                            : "Não conectado"}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(session.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Responsável: {session.owner?.name || "—"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.status !== "connected" && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenQRDialog(session)}
                      >
                        <QrCode className="w-4 h-4 mr-1" />
                        QR Code
                      </Button>
                    )}
                    {session.status === "connected" && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleLogout(session)}
                      >
                        <LogOut className="w-4 h-4 mr-1" />
                        Desconectar
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleVerifyConnection(session)}
                      disabled={verifyingSessionId === session.id}
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${verifyingSessionId === session.id ? "animate-spin" : ""}`} />
                      Verificar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleOpenAccessDialog(session)}
                    >
                      <Users className="w-4 h-4 mr-1" />
                      Acessos
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedSession(session);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDebugInstances(session)}
                      disabled={debugLoading}
                      className="text-blue-500 hover:text-blue-600"
                    >
                      <Bug className="w-4 h-4" />
                      {debugLoading && selectedSession?.id === session.id ? "..." : "Debug"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Session Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
              <DialogDescription>
                Dê um nome para identificar esta conexão
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome da Instância</Label>
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: Vendas, Suporte, Marketing..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateSession} 
                disabled={!instanceName.trim() || createSession.isPending}
              >
                {createSession.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar e Conectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="w-[90%] sm:max-w-md sm:w-full rounded-lg">
            <DialogHeader>
              <DialogTitle>Escanear QR Code</DialogTitle>
              <DialogDescription>
                {instanceNotFound 
                  ? "A instância não existe mais na Evolution API. Clique em 'Reconectar' para recriá-la."
                  : "Abra o WhatsApp no seu celular e escaneie o código abaixo"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center py-6">
              {isRefreshingQr || getQRCode.isPending || recreateInstance.isPending ? (
                <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : instanceNotFound ? (
                <div className="w-64 h-64 flex flex-col items-center justify-center bg-muted rounded-lg">
                  <XCircle className="w-12 h-12 text-destructive mb-4" />
                  <p className="text-muted-foreground text-center px-4">
                    Instância não encontrada
                  </p>
                </div>
              ) : qrCode ? (
                <img 
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code"
                  className="w-64 h-64 rounded-lg"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                  <p className="text-muted-foreground text-center px-4">
                    Não foi possível gerar o QR Code
                  </p>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                {instanceNotFound ? (
                  <Button
                    onClick={handleRecreateInstance}
                    disabled={recreateInstance.isPending}
                  >
                    {recreateInstance.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Reconectar Instância
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => selectedSession && refreshQRCode(selectedSession.instance_name)}
                      disabled={isRefreshingQr}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingQr ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                    <Button
                      onClick={() => selectedSession && checkConnectionStatus(selectedSession)}
                      disabled={getConnectionStatus.isPending}
                    >
                      {getConnectionStatus.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Verificar Conexão
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Access Control Dialog */}
        <AccessControlDialog
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
          session={selectedSession}
          users={users || []}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="w-[95%] max-w-[400px] rounded-lg">
            <DialogHeader>
              <DialogTitle>Excluir Conexão</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir a conexão "{selectedSession?.instance_name}"? 
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row justify-end gap-3 sm:gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="flex-1 sm:flex-none">
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSession}
                disabled={deleteSession.isPending}
                className="flex-1 sm:flex-none"
              >
                {deleteSession.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Debug Evolution Instances Dialog */}
        <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
          <DialogContent className="w-[90%] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Debug Evolution Instances</DialogTitle>
              <DialogDescription>
                Resultados dos testes com {selectedSession?.instance_name}
              </DialogDescription>
            </DialogHeader>
            
            {debugLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : debugResults ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(debugResults, null, 2)}
                  </pre>
                </div>
                <Button onClick={copyDebugResults} className="w-full">
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar JSON
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function AccessControlDialog({
  open,
  onOpenChange,
  session,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WhatsAppSession | null;
  users: Array<{ id: string; name: string; email: string }>;
}) {
  const { data: accessList, isLoading } = useSessionAccess(session?.id || null);
  const grantAccess = useGrantSessionAccess();
  const revokeAccess = useRevokeSessionAccess();

  const accessMap = new Map(accessList?.map(a => [a.user_id, a]));

  const handleToggleAccess = async (userId: string, hasAccess: boolean) => {
    if (!session) return;

    if (hasAccess) {
      await revokeAccess.mutateAsync({ sessionId: session.id, userId });
    } else {
      await grantAccess.mutateAsync({ sessionId: session.id, userId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] sm:max-w-md sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar Acessos</DialogTitle>
          <DialogDescription>
            Selecione quais usuários podem ver e enviar mensagens
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="space-y-3 py-4">
            {users
              .filter(u => u.id !== session?.owner_user_id)
              .map((user) => {
                const access = accessMap.get(user.id);
                const hasAccess = !!access;

                return (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <Checkbox
                      checked={hasAccess}
                      onCheckedChange={() => handleToggleAccess(user.id, hasAccess)}
                      disabled={grantAccess.isPending || revokeAccess.isPending}
                    />
                  </div>
                );
              })}
          </div>
        </ScrollArea>
        <div className="flex gap-2 pt-4">
          <Button className="w-full rounded-xl" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
