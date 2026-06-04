import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Building2, Gauge, Loader2, MessageSquareText, Send, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  AIOrganizationSetting,
  useAdminAILogs,
  useAdminAIOrganizations,
  useAdminAIOverview,
  useAIPreview,
  useAIOrganizationSettings,
  useJennyAgent,
  useUpdateJennyAgent,
  useUpsertAIOrganizationSetting,
} from "@/hooks/use-admin-ai";
import { cn } from "@/lib/utils";

const CONTEXT_OPTIONS = [
  { key: "lead_basic", label: "Lead básico" },
  { key: "conversation_recent", label: "Conversa recente" },
  { key: "properties_public", label: "Imóveis públicos" },
  { key: "pipeline_stage", label: "Etapa do funil" },
  { key: "assigned_owner", label: "Responsável" },
  { key: "tasks_open", label: "Tarefas abertas" },
];

const DEFAULT_ORG_SETTING = {
  mode: "preview" as const,
  is_enabled: false,
  allowed_contexts: ["lead_basic", "conversation_recent"],
  organization_prompt: "",
  business_rules: "",
  handoff_keywords: ["humano", "atendente", "corretor", "ligar", "reclamar", "cancelar"],
  require_human_approval: true,
  daily_token_budget: 3000,
  monthly_token_budget: 60000,
  max_output_tokens: 360,
  max_context_messages: 8,
  pii_redaction_enabled: true,
  store_ai_outputs: true,
};

export default function AdminAI() {
  const { data: agent, isLoading: loadingAgent } = useJennyAgent();
  const { data: orgs = [] } = useAdminAIOrganizations();
  const { data: settings = [] } = useAIOrganizationSettings(agent?.id);
  const { data: overview } = useAdminAIOverview();
  const { data: logs = [] } = useAdminAILogs();

  const updateAgent = useUpdateJennyAgent();
  const upsertOrg = useUpsertAIOrganizationSetting();
  const preview = useAIPreview();

  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [message, setMessage] = useState("Olá, procuro um apartamento de 2 quartos. Você pode me ajudar?");
  const [useOpenAI, setUseOpenAI] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Array<{ role: "user" | "assistant"; content: string; meta?: string }>>([]);

  const selectedOrg = useMemo(() => orgs.find((org) => org.id === selectedOrgId), [orgs, selectedOrgId]);
  const selectedSetting = useMemo(
    () => settings.find((item) => item.organization_id === selectedOrgId),
    [settings, selectedOrgId],
  );
  const effectiveSetting = { ...DEFAULT_ORG_SETTING, ...(selectedSetting || {}) } as AIOrganizationSetting;

  const saveAgent = (field: string, value: string | number | boolean) => {
    if (!agent) return;
    updateAgent.mutate({ id: agent.id, [field]: value } as any);
  };

  const saveOrgSetting = (patch: Partial<AIOrganizationSetting>) => {
    if (!agent || !selectedOrgId) return;
    upsertOrg.mutate({
      ...effectiveSetting,
      ...patch,
      organization_id: selectedOrgId,
      agent_id: agent.id,
    });
  };

  const toggleContext = (key: string, enabled: boolean) => {
    const current = new Set(effectiveSetting.allowed_contexts || []);
    if (enabled) current.add(key);
    else current.delete(key);
    saveOrgSetting({ allowed_contexts: Array.from(current) });
  };

  const sendPreview = () => {
    if (!selectedOrgId || !message.trim()) return;
    const userMessage = message.trim();
    setPreviewMessages((items) => [...items, { role: "user", content: userMessage }]);
    setMessage("");
    preview.mutate(
      { organization_id: selectedOrgId, message: userMessage, use_openai: useOpenAI },
      {
        onSuccess: (data) => {
          setPreviewMessages((items) => [
            ...items,
            {
              role: "assistant",
              content: data.reply,
              meta: `${data.model} • ${data.skipped_openai ? "sem custo" : `${data.total_tokens || 0} tokens`} • ${data.latency_ms || 0}ms`,
            },
          ]);
        },
      },
    );
  };

  if (loadingAgent) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Jenny IA</h1>
            <p className="text-sm text-muted-foreground">
              Controle global, isolamento por organização, custos e testes antes da ativação.
            </p>
          </div>
          <Badge variant={agent?.is_active ? "default" : "secondary"} className="w-fit">
            {agent?.is_active ? "Jenny ativa como produto" : "Jenny pausada"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric icon={MessageSquareText} label="Interações 30d" value={overview?.totalInteractions || 0} />
          <Metric icon={Gauge} label="Tokens 30d" value={(overview?.totalTokens || 0).toLocaleString("pt-BR")} />
          <Metric icon={ShieldCheck} label="Sucesso" value={`${overview?.successRate ?? 100}%`} />
          <Metric icon={SlidersHorizontal} label="Custo estimado" value={`US$ ${(overview?.estimatedCost || 0).toFixed(4)}`} />
        </div>

        <Tabs defaultValue="global" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 md:w-fit">
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="orgs">Organizações</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="global">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5" />
                  Configuração global da Jenny
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Nome">
                      <Input defaultValue={agent?.name} onBlur={(e) => saveAgent("name", e.target.value)} />
                    </Field>
                    <Field label="Modelo padrão econômico">
                      <Input defaultValue={agent?.default_model} onBlur={(e) => saveAgent("default_model", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Prompt global">
                    <Textarea
                      defaultValue={agent?.system_prompt}
                      rows={8}
                      onBlur={(e) => saveAgent("system_prompt", e.target.value)}
                    />
                  </Field>
                  <Field label="Prompt de segurança/LGPD">
                    <Textarea
                      defaultValue={agent?.safety_prompt}
                      rows={5}
                      onBlur={(e) => saveAgent("safety_prompt", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="space-y-4">
                  <Card className="border-muted">
                    <CardContent className="space-y-4 pt-4">
                      <div className="flex items-center justify-between">
                        <Label>Produto ativo</Label>
                        <Switch checked={!!agent?.is_active} onCheckedChange={(v) => saveAgent("is_active", v)} />
                      </div>
                      <Field label="Temperatura">
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          defaultValue={agent?.temperature}
                          onBlur={(e) => saveAgent("temperature", Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Saída máxima">
                        <Input
                          type="number"
                          defaultValue={agent?.max_output_tokens}
                          onBlur={(e) => saveAgent("max_output_tokens", Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Orçamento diário global">
                        <Input
                          type="number"
                          defaultValue={agent?.daily_token_budget}
                          onBlur={(e) => saveAgent("daily_token_budget", Number(e.target.value))}
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orgs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-5 w-5" />
                  Liberação por organização
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2">
                  {orgs.map((org) => {
                    const orgSetting = settings.find((item) => item.organization_id === org.id);
                    return (
                      <button
                        key={org.id}
                        onClick={() => setSelectedOrgId(org.id)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted",
                          selectedOrgId === org.id && "border-primary bg-primary/5",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{org.name}</span>
                          <Badge variant={orgSetting?.is_enabled ? "default" : "secondary"}>
                            {orgSetting?.is_enabled ? orgSetting.mode : "off"}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedOrgId ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">{selectedOrg?.name}</h2>
                        <p className="text-sm text-muted-foreground">Tudo aqui fica isolado nesta organização.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label>Habilitada</Label>
                        <Switch
                          checked={effectiveSetting.is_enabled}
                          onCheckedChange={(v) => saveOrgSetting({ is_enabled: v, mode: v ? effectiveSetting.mode : "off" })}
                        />
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Modo">
                        <Select value={effectiveSetting.mode} onValueChange={(v: any) => saveOrgSetting({ mode: v, is_enabled: v !== "off" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="off">Desligado</SelectItem>
                            <SelectItem value="preview">Preview</SelectItem>
                            <SelectItem value="assist">Assistido</SelectItem>
                            <SelectItem value="auto">Automático</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Budget diário">
                        <Input type="number" defaultValue={effectiveSetting.daily_token_budget} onBlur={(e) => saveOrgSetting({ daily_token_budget: Number(e.target.value) })} />
                      </Field>
                      <Field label="Máx. tokens resposta">
                        <Input type="number" defaultValue={effectiveSetting.max_output_tokens} onBlur={(e) => saveOrgSetting({ max_output_tokens: Number(e.target.value) })} />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Prompt da organização">
                        <Textarea rows={6} defaultValue={effectiveSetting.organization_prompt} onBlur={(e) => saveOrgSetting({ organization_prompt: e.target.value })} />
                      </Field>
                      <Field label="Regras comerciais">
                        <Textarea rows={6} defaultValue={effectiveSetting.business_rules} onBlur={(e) => saveOrgSetting({ business_rules: e.target.value })} />
                      </Field>
                    </div>
                    <div>
                      <Label>Contextos liberados</Label>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        {CONTEXT_OPTIONS.map((option) => (
                          <label key={option.key} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                            <Checkbox
                              checked={effectiveSetting.allowed_contexts?.includes(option.key)}
                              onCheckedChange={(v) => toggleContext(option.key, v === true)}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow
                        label="Exigir aprovação humana"
                        checked={effectiveSetting.require_human_approval}
                        onChange={(v) => saveOrgSetting({ require_human_approval: v })}
                      />
                      <ToggleRow
                        label="Mascarar dados pessoais"
                        checked={effectiveSetting.pii_redaction_enabled}
                        onChange={(v) => saveOrgSetting({ pii_redaction_enabled: v })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    Selecione uma organização para configurar a Jenny.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquareText className="h-5 w-5" />
                  Preview de conversa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma organização" /></SelectTrigger>
                    <SelectContent>
                      {orgs.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 rounded-lg border px-3">
                    <Switch checked={useOpenAI} onCheckedChange={setUseOpenAI} />
                    <span className="text-sm">Usar OpenAI</span>
                  </div>
                </div>
                <div className="min-h-[280px] rounded-lg border bg-muted/30 p-3">
                  {previewMessages.length === 0 ? (
                    <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                      Envie uma mensagem para testar a Jenny nesta organização.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {previewMessages.map((item, index) => (
                        <div key={`${item.role}-${index}`} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[78%] rounded-lg px-3 py-2 text-sm", item.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border")}>
                            <p>{item.content}</p>
                            {item.meta && <p className="mt-1 text-[11px] opacity-70">{item.meta}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
                  <Button onClick={sendPreview} disabled={!selectedOrgId || !message.trim() || preview.isPending} className="self-stretch">
                    {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Atuação e custos recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[160px_1fr_140px]">
                    <div>
                      <Badge variant={log.success ? "default" : "destructive"}>{log.event_type}</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{log.output_preview || log.input_preview || "Sem prévia"}</p>
                      <p className="text-xs text-muted-foreground">{log.model || "modelo não informado"} • {log.mode}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{log.total_tokens || 0} tokens</p>
                      <p>US$ {Number(log.estimated_cost_usd || 0).toFixed(5)}</p>
                      <p>{log.latency_ms || 0}ms</p>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                    Nenhuma atuação registrada ainda.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
