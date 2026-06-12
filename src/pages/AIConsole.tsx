import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bot, CheckCircle2, Gauge, Loader2, MessageSquareText, Send, Sparkles, UserRoundCheck } from "lucide-react";
import {
  DEFAULT_ORG_AI_SETTING,
  useOrganizationAISettings,
  useOrganizationAIUsage,
  useSaveOrganizationAISetting,
} from "@/hooks/use-organization-ai";
import type { AIOrganizationSetting } from "@/hooks/use-admin-ai";
import { useAuth } from "@/contexts/AuthContext";

type Mode = AIOrganizationSetting["mode"];

const modeLabels: Record<Mode, string> = {
  off: "Desligada",
  preview: "Preview",
  assist: "Assistida",
  auto: "Automatica",
};

const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);

const formatDateTime = (value: string | null) => {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export default function AIConsole() {
  const { organization } = useAuth();
  const { agent, organizationId, effectiveSetting, isLoading } = useOrganizationAISettings();
  const { data: usage, isLoading: loadingUsage } = useOrganizationAIUsage(30);
  const saveSetting = useSaveOrganizationAISetting();

  const [form, setForm] = useState({
    is_enabled: DEFAULT_ORG_AI_SETTING.is_enabled,
    mode: DEFAULT_ORG_AI_SETTING.mode as Mode,
    organization_prompt: DEFAULT_ORG_AI_SETTING.organization_prompt,
    business_rules: DEFAULT_ORG_AI_SETTING.business_rules,
    handoff_keywords: DEFAULT_ORG_AI_SETTING.handoff_keywords.join(", "),
    daily_token_budget: DEFAULT_ORG_AI_SETTING.daily_token_budget,
    monthly_token_budget: DEFAULT_ORG_AI_SETTING.monthly_token_budget,
    max_context_messages: DEFAULT_ORG_AI_SETTING.max_context_messages,
    max_output_tokens: DEFAULT_ORG_AI_SETTING.max_output_tokens,
  });

  useEffect(() => {
    setForm({
      is_enabled: !!effectiveSetting.is_enabled,
      mode: effectiveSetting.mode || DEFAULT_ORG_AI_SETTING.mode,
      organization_prompt: effectiveSetting.organization_prompt || "",
      business_rules: effectiveSetting.business_rules || "",
      handoff_keywords: (effectiveSetting.handoff_keywords || DEFAULT_ORG_AI_SETTING.handoff_keywords).join(", "),
      daily_token_budget: effectiveSetting.daily_token_budget || DEFAULT_ORG_AI_SETTING.daily_token_budget,
      monthly_token_budget: effectiveSetting.monthly_token_budget || DEFAULT_ORG_AI_SETTING.monthly_token_budget,
      max_context_messages: effectiveSetting.max_context_messages || DEFAULT_ORG_AI_SETTING.max_context_messages,
      max_output_tokens: effectiveSetting.max_output_tokens || DEFAULT_ORG_AI_SETTING.max_output_tokens,
    });
  }, [
    effectiveSetting.agent_id,
    effectiveSetting.organization_id,
    effectiveSetting.is_enabled,
    effectiveSetting.mode,
    effectiveSetting.organization_prompt,
    effectiveSetting.business_rules,
    effectiveSetting.daily_token_budget,
    effectiveSetting.monthly_token_budget,
    effectiveSetting.max_context_messages,
    effectiveSetting.max_output_tokens,
    effectiveSetting.handoff_keywords,
  ]);

  const metrics = useMemo(() => usage || {
    requests: 0,
    tokens: 0,
    messagesSent: 0,
    leadsAttended: 0,
    leadsQualified: 0,
    successRate: 100,
    recentQualified: [],
  }, [usage]);

  const canSave = !!agent?.id && !!organizationId && !saveSetting.isPending;

  const handleSave = () => {
    if (!agent?.id || !organizationId) return;

    const keywords = form.handoff_keywords
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    saveSetting.mutate({
      ...effectiveSetting,
      is_enabled: form.is_enabled,
      mode: form.is_enabled ? form.mode : "off",
      allowed_contexts: effectiveSetting.allowed_contexts?.length
        ? effectiveSetting.allowed_contexts
        : DEFAULT_ORG_AI_SETTING.allowed_contexts,
      organization_prompt: form.organization_prompt,
      business_rules: form.business_rules,
      handoff_keywords: keywords.length ? keywords : DEFAULT_ORG_AI_SETTING.handoff_keywords,
      daily_token_budget: Number(form.daily_token_budget) || DEFAULT_ORG_AI_SETTING.daily_token_budget,
      monthly_token_budget: Number(form.monthly_token_budget) || DEFAULT_ORG_AI_SETTING.monthly_token_budget,
      max_context_messages: Math.max(2, Number(form.max_context_messages) || DEFAULT_ORG_AI_SETTING.max_context_messages),
      max_output_tokens: Math.max(120, Number(form.max_output_tokens) || DEFAULT_ORG_AI_SETTING.max_output_tokens),
      organization_id: organizationId,
      agent_id: agent.id,
    });
  };

  return (
    <AppLayout title="Jhenny IA">
      <div className="space-y-6 animate-in">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Jhenny IA</h1>
            <p className="text-sm text-muted-foreground">
              Atendimento, consumo e qualificacao da IA em {organization?.name || "sua organizacao"}.
            </p>
          </div>
          <Badge variant={form.is_enabled && form.mode !== "off" ? "default" : "secondary"} className="w-fit">
            {form.is_enabled && form.mode !== "off" ? `Jhenny ${modeLabels[form.mode]}` : "Jhenny desligada"}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Metric loading={loadingUsage} icon={MessageSquareText} label="Requisicoes 30d" value={formatNumber(metrics.requests)} />
          <Metric loading={loadingUsage} icon={Gauge} label="Tokens 30d" value={formatNumber(metrics.tokens)} />
          <Metric loading={loadingUsage} icon={Send} label="Mensagens IA" value={formatNumber(metrics.messagesSent)} />
          <Metric loading={loadingUsage} icon={Sparkles} label="Leads atendidos" value={formatNumber(metrics.leadsAttended)} />
          <Metric loading={loadingUsage} icon={UserRoundCheck} label="Qualificados" value={formatNumber(metrics.leadsQualified)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5" />
                Configuracao da organizacao
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                      <div>
                        <Label>Ativar Jhenny nesta organizacao</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          O modo automatico responde leads conforme as regras do WhatsApp e da fila.
                        </p>
                      </div>
                      <Switch
                        checked={form.is_enabled}
                        onCheckedChange={(checked) => setForm((prev) => ({
                          ...prev,
                          is_enabled: checked,
                          mode: checked && prev.mode === "off" ? "preview" : prev.mode,
                        }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Modo</Label>
                      <Select
                        value={form.mode}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, mode: value as Mode }))}
                        disabled={!form.is_enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preview">Preview</SelectItem>
                          <SelectItem value="assist">Assistida</SelectItem>
                          <SelectItem value="auto">Automatica</SelectItem>
                          <SelectItem value="off">Desligada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Prompt da organizacao</Label>
                    <Textarea
                      rows={7}
                      value={form.organization_prompt}
                      onChange={(event) => setForm((prev) => ({ ...prev, organization_prompt: event.target.value }))}
                      placeholder="Tom de voz, bairros prioritarios, diferenciais da imobiliaria, padrao de abordagem..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Regras comerciais e limites</Label>
                    <Textarea
                      rows={7}
                      value={form.business_rules}
                      onChange={(event) => setForm((prev) => ({ ...prev, business_rules: event.target.value }))}
                      placeholder="Nunca informar endereco completo, proprietario ou dados sensiveis. Preferir corretor quando..."
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Tokens diarios</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.daily_token_budget}
                        onChange={(event) => setForm((prev) => ({ ...prev, daily_token_budget: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tokens mensais</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.monthly_token_budget}
                        onChange={(event) => setForm((prev) => ({ ...prev, monthly_token_budget: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagens de contexto</Label>
                      <Input
                        type="number"
                        min={2}
                        max={12}
                        value={form.max_context_messages}
                        onChange={(event) => setForm((prev) => ({ ...prev, max_context_messages: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Saida maxima</Label>
                      <Input
                        type="number"
                        min={120}
                        max={900}
                        value={form.max_output_tokens}
                        onChange={(event) => setForm((prev) => ({ ...prev, max_output_tokens: Number(event.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Palavras que chamam corretor</Label>
                    <Input
                      value={form.handoff_keywords}
                      onChange={(event) => setForm((prev) => ({ ...prev, handoff_keywords: event.target.value }))}
                      placeholder="corretor, especialista, ligar, visita"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={!canSave} className="gap-2">
                      {saveSetting.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Salvar configuracao
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado 30d</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ResultRow label="Taxa de sucesso" value={`${metrics.successRate}%`} />
                <ResultRow label="Mensagens por lead" value={metrics.leadsAttended ? (metrics.messagesSent / metrics.leadsAttended).toFixed(1) : "0"} />
                <ResultRow label="Tokens por requisicao" value={metrics.requests ? formatNumber(Math.round(metrics.tokens / metrics.requests)) : "0"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads qualificados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingUsage ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : metrics.recentQualified.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum lead qualificado pela Jhenny nos ultimos 30 dias.</p>
                ) : (
                  metrics.recentQualified.map((lead) => (
                    <div key={lead.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{lead.leadName}</p>
                          <p className="text-xs text-muted-foreground">{lead.leadPhone || "Sem telefone"}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {formatDateTime(lead.handedOffAt)}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{lead.summary}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: ElementType;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-6 w-20" /> : <p className="text-xl font-semibold">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
