import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Users, ArrowLeft, Link2, Copy, Pencil, Check } from "lucide-react";
import {
  useWhatsAppGroups,
  useSyncGroups,
  useGroupInfo,
  useGroupInviteLink,
  useUpdateGroup,
  WhatsAppGroup,
} from "@/hooks/use-whatsapp-groups";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  sessionName?: string;
}

export function GroupsManagerSheet({ open, onOpenChange, sessionId, sessionName }: Props) {
  const { data: groups = [], isLoading } = useWhatsAppGroups(sessionId || undefined);
  const sync = useSyncGroups();
  const [selected, setSelected] = useState<WhatsAppGroup | null>(null);

  const handleSync = () => {
    if (!sessionId) return;
    sync.mutate(sessionId, {
      onSuccess: () => toast({ title: "Grupos sincronizados" }),
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelected(null); }}>
      <SheetContent side="right" className="w-[90%] sm:w-[650px] sm:max-w-[650px] p-6 flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {selected ? (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(null)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                Detalhes do Grupo
              </>
            ) : (
              <>
                <Users className="w-5 h-5" />
                Grupos {sessionName && <span className="text-muted-foreground font-normal">— {sessionName}</span>}
              </>
            )}
          </SheetTitle>
          {!selected && (
            <SheetDescription>
              Grupos do WhatsApp sincronizados desta conexão
            </SheetDescription>
          )}
        </SheetHeader>

        {!selected ? (
          <>
            <div className="flex items-center justify-between py-3">
              <p className="text-sm text-muted-foreground">
                {groups.length} {groups.length === 1 ? "grupo" : "grupos"}
              </p>
              <Button size="sm" variant="outline" onClick={handleSync} disabled={sync.isPending || !sessionId}>
                {sync.isPending
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Sincronizar
              </Button>
            </div>
            <ScrollArea className="flex-1 -mx-2 px-2">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum grupo sincronizado. Clique em "Sincronizar" para buscar do WhatsApp.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelected(g)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/40 transition-colors text-left"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={g.picture_url || undefined} />
                        <AvatarFallback><Users className="w-4 h-4" /></AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.subject || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {Array.isArray(g.participants) ? `${g.participants.length} participantes` : "—"}
                        </p>
                      </div>
                      {g.is_announce && <Badge variant="secondary" className="text-[10px]">Anúncios</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <GroupDetail group={selected} sessionId={sessionId!} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupDetail({ group, sessionId }: { group: WhatsAppGroup; sessionId: string }) {
  const info = useGroupInfo();
  const inviteLink = useGroupInviteLink();
  const update = useUpdateGroup();
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState(group.subject || "");
  const [desc, setDesc] = useState(group.description || "");
  const [invite, setInvite] = useState<string | null>(null);

  const handleGetInvite = () => {
    inviteLink.mutate(
      { sessionId, jid: group.group_jid },
      {
        onSuccess: (d: any) => {
          const link = d?.inviteUrl || d?.url || (d?.inviteCode ? `https://chat.whatsapp.com/${d.inviteCode}` : null);
          setInvite(link);
        },
        onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleSave = (field: "name" | "description", value: string) => {
    update.mutate(
      { sessionId, jid: group.group_jid, field, value },
      {
        onSuccess: () => {
          toast({ title: "Grupo atualizado" });
          if (field === "name") setEditingName(false);
          else setEditingDesc(false);
        },
        onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <ScrollArea className="flex-1 -mx-2 px-2 pt-4">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16">
            <AvatarImage src={group.picture_url || undefined} />
            <AvatarFallback><Users className="w-6 h-6" /></AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-1.5">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => handleSave("name", name)} disabled={update.isPending}>
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{group.subject || "Sem nome"}</p>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingName(true)}>
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate">{group.group_jid}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Descrição</p>
          {editingDesc ? (
            <div className="space-y-2">
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
              <Button size="sm" onClick={() => handleSave("description", desc)} disabled={update.isPending}>
                {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm flex-1">{group.description || <span className="text-muted-foreground">Sem descrição</span>}</p>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingDesc(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Link de convite</p>
          {invite ? (
            <div className="flex items-center gap-1.5">
              <Input value={invite} readOnly className="h-8 text-xs" />
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(invite); toast({ title: "Link copiado" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={handleGetInvite} disabled={inviteLink.isPending}>
              {inviteLink.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
              Gerar link
            </Button>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">
            Participantes ({Array.isArray(group.participants) ? group.participants.length : 0})
          </p>
          <div className="space-y-1 max-h-64 overflow-auto">
            {Array.isArray(group.participants) && group.participants.length > 0 ? (
              group.participants.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/30">
                  <span className="truncate">{p.id || p.jid || p}</span>
                  {(p.admin === "admin" || p.admin === "superadmin") && (
                    <Badge variant="secondary" className="text-[9px] ml-2">{p.admin === "superadmin" ? "Dono" : "Admin"}</Badge>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum participante carregado</p>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
