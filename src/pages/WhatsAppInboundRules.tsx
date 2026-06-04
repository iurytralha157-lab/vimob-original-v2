import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Rule = {
  id?: string;
  organization_id?: string;
  session_id: string | null;
  name: string;
  priority: number;
  is_active: boolean;
  match_type: "contains" | "equals" | "regex" | "utm" | "meta_ctwa" | "any";
  match_value: string | null;
  match_field: string | null;
  target_round_robin_id: string | null;
  target_team_id: string | null;
  target_user_id: string | null;
  target_pipeline_id: string | null;
  target_stage_id: string | null;
  source_label: string | null;
  campaign_label: string | null;
};

const EMPTY: Rule = {
  session_id: null,
  name: "",
  priority: 100,
  is_active: true,
  match_type: "contains",
  match_value: "",
  match_field: "message",
  target_round_robin_id: null,
  target_team_id: null,
  target_user_id: null,
  target_pipeline_id: null,
  target_stage_id: null,
  source_label: null,
  campaign_label: null,
};

export default function WhatsAppInboundRules() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Rule | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["inbound-rules", profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_inbound_rules" as any)
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data || []) as any as Rule[];
    },
    enabled: !!profile?.organization_id,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["wa-sessions-min", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_sessions")
        .select("id, display_name, instance_name, phone_number")
        .eq("organization_id", profile!.organization_id!);
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines-min", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("pipelines").select("id, name").eq("organization_id", profile!.organization_id!);
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const { data: roundRobins = [] } = useQuery({
    queryKey: ["round-robins-min", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("round_robins").select("id, name").eq("organization_id", profile!.organization_id!);
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams-min", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name").eq("organization_id", profile!.organization_id!);
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const saveRule = useMutation({
    mutationFn: async (r: Rule) => {
      const payload: any = { ...r, organization_id: profile!.organization_id };
      delete payload.id;
      if (r.id) {
        const { error } = await supabase.from("whatsapp_inbound_rules" as any).update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_inbound_rules" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbound-rules"] });
      setEditing(null);
      toast({ title: "Regra salva" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_inbound_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbound-rules"] });
      toast({ title: "Regra removida" });
    },
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">Regras de Entrada WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Identifique e distribua leads automaticamente conforme a mensagem ou origem.</p>
          </div>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-2" /> Nova regra</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regras ativas</CardTitle>
          <CardDescription>As regras são avaliadas em ordem de prioridade (menor número primeiro).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma regra configurada.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-2xl border border-border/40 hover:border-border transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary">{r.priority}</Badge>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.match_type} {r.match_value ? `→ "${r.match_value}"` : ""} {r.source_label ? `· source: ${r.source_label}` : ""}
                      </p>
                    </div>
                    {!r.is_active && <Badge variant="outline">Inativa</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteRule.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-[90%] sm:w-[650px] sm:max-w-[650px] p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Editar regra" : "Nova regra"}</SheetTitle>
            <SheetDescription>Quando um WhatsApp inbound casar com os critérios, um lead será criado e distribuído.</SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Ativa</Label>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Critério</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={editing.match_type} onValueChange={(v: any) => setEditing({ ...editing, match_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">Contém</SelectItem>
                        <SelectItem value="equals">Igual a</SelectItem>
                        <SelectItem value="regex">Regex</SelectItem>
                        <SelectItem value="utm">UTM</SelectItem>
                        <SelectItem value="meta_ctwa">Meta Ads (CTWA)</SelectItem>
                        <SelectItem value="any">Qualquer mensagem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Campo</Label>
                    <Select value={editing.match_field || "message"} onValueChange={(v) => setEditing({ ...editing, match_field: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="message">Mensagem</SelectItem>
                        <SelectItem value="push_name">Nome do contato</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                        <SelectItem value="meta_source_id">ID Meta (sourceId)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <Input value={editing.match_value || ""} onChange={(e) => setEditing({ ...editing, match_value: e.target.value })} placeholder="ex.: Riviera" />
                  </div>
                </div>

                <div>
                  <Label>Sessão WhatsApp (opcional)</Label>
                  <Select value={editing.session_id || "_all"} onValueChange={(v) => setEditing({ ...editing, session_id: v === "_all" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todas as sessões</SelectItem>
                      {sessions.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.display_name || s.instance_name} {s.phone_number ? `(${s.phone_number})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Roteamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Pipeline</Label>
                    <Select value={editing.target_pipeline_id || "_none"} onValueChange={(v) => setEditing({ ...editing, target_pipeline_id: v === "_none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Padrão" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Padrão</SelectItem>
                        {pipelines.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Round Robin</Label>
                    <Select value={editing.target_round_robin_id || "_none"} onValueChange={(v) => setEditing({ ...editing, target_round_robin_id: v === "_none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {roundRobins.map((rr: any) => <SelectItem key={rr.id} value={rr.id}>{rr.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Equipe</Label>
                    <Select value={editing.target_team_id || "_none"} onValueChange={(v) => setEditing({ ...editing, target_team_id: v === "_none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma</SelectItem>
                        {teams.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Source (label)</Label>
                    <Input value={editing.source_label || ""} onChange={(e) => setEditing({ ...editing, source_label: e.target.value })} placeholder="ex.: meta_ctwa, organic" />
                  </div>
                  <div className="col-span-2">
                    <Label>Nome da campanha (utm_campaign)</Label>
                    <Input value={editing.campaign_label || ""} onChange={(e) => setEditing({ ...editing, campaign_label: e.target.value })} placeholder="ex.: Lançamento Riviera" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing && saveRule.mutate(editing)} disabled={!editing?.name || saveRule.isPending}>Salvar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
