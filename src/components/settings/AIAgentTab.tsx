import { useState } from "react";
import { Bot, Plus, Trash2, ChevronDown, ChevronUp, MessageSquare, User, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAIAgents, useCreateAIAgent, useUpdateAIAgent, useDeleteAIAgent, useAIAgentConversations, AIAgent } from "@/hooks/use-ai-agents";
import { useWhatsAppSessions } from "@/hooks/use-whatsapp-sessions";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  handed_off: { label: "Transferido", variant: "secondary" },
  completed: { label: "Concluído", variant: "outline" },
};

function AgentForm({ agent, onCancel }: { agent?: AIAgent; onCancel: () => void }) {
  const { data: sessions = [] } = useWhatsAppSessions();
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();

  const [name, setName] = useState(agent?.name || "Assistente");
  const [isActive, setIsActive] = useState(agent?.is_active ?? true);
  const [sessionId, setSessionId] = useState(agent?.session_id || "all");
  const [provider, setProvider] = useState(agent?.ai_provider || "openai");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || "");
  const [maxMessages, setMaxMessages] = useState(agent?.max_messages_before_handoff || 20);
  const [keywords, setKeywords] = useState<string[]>(agent?.handoff_keywords || []);
  const [keywordInput, setKeywordInput] = useState("");

  const isLoading = createAgent.isPending || updateAgent.isPending;

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => setKeywords(keywords.filter((k) => k !== kw));

  const handleSave = () => {
    const payload = {
      name,
      is_active: isActive,
      session_id: sessionId === "all" ? null : sessionId || null,
      ai_provider: provider,
      system_prompt: systemPrompt || null,
      handoff_keywords: keywords.length > 0 ? keywords : null,
      max_messages_before_handoff: maxMessages,
    };

    if (agent) {
      updateAgent.mutate({ id: agent.id, ...payload }, { onSuccess: onCancel });
    } else {
      createAgent.mutate(payload as any, { onSuccess: onCancel });
    }
  };

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-muted/30">
      {/* Name + Active */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <Label>Nome do Agente</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Assistente" />
        </div>
        <div className="flex flex-col items-center gap-1 pt-5">
          <Label className="text-xs">Ativo</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      {/* WhatsApp Session */}
      <div className="space-y-1">
        <Label>Sessão WhatsApp (número)</Label>
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger>
            <SelectValue placeholder="Qualquer sessão da organização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer sessão</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.display_name || s.instance_name}
                {s.phone_number ? ` (${s.phone_number})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Deixe em branco para usar em todas as sessões.</p>
      </div>

      {/* AI Provider */}
      <div className="space-y-2">
        <Label>Provedor de IA</Label>
        <RadioGroup value={provider} onValueChange={setProvider} className="flex gap-6">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="openai" id="provider-openai" />
            <Label htmlFor="provider-openai">OpenAI (GPT-4o-mini)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="gemini" id="provider-gemini" />
            <Label htmlFor="provider-gemini">Google Gemini</Label>
          </div>
        </RadioGroup>
      </div>

      {/* System Prompt */}
      <div className="space-y-1">
        <Label>System Prompt (personalidade da IA)</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Você é um assistente de atendimento amigável e profissional. Ajude o cliente com dúvidas sobre nossos produtos e serviços..."
          rows={5}
        />
        <p className="text-xs text-muted-foreground">Deixe em branco para usar o prompt padrão.</p>
      </div>

      {/* Handoff Keywords */}
      <div className="space-y-2">
        <Label>Palavras-chave para transferência humana</Label>
        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="ex: falar com atendente"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          />
          <Button type="button" variant="outline" onClick={addKeyword}>Adicionar</Button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1">
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Max Messages */}
      <div className="space-y-2">
        <Label>Limite de mensagens antes de transferir: <span className="font-bold">{maxMessages}</span></Label>
        <Slider
          value={[maxMessages]}
          onValueChange={([v]) => setMaxMessages(v)}
          min={5}
          max={100}
          step={5}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5</span>
          <span>100</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {agent ? "Salvar" : "Criar Agente"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AIAgent }) {
  const deleteAgent = useDeleteAIAgent();
  const updateAgent = useUpdateAIAgent();
  const { data: conversations = [] } = useAIAgentConversations(agent.id);
  const [editing, setEditing] = useState(false);
  const [showConvs, setShowConvs] = useState(false);

  if (editing) {
    return <AgentForm agent={agent} onCancel={() => setEditing(false)} />;
  }

  const activeConvs = conversations.filter((c) => c.status === "active").length;
  const handedOffConvs = conversations.filter((c) => c.status === "handed_off").length;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${agent.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{agent.name}</h3>
              <Badge variant={agent.is_active ? "default" : "secondary"}>
                {agent.is_active ? "Ativo" : "Inativo"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {agent.ai_provider === "openai" ? "OpenAI" : "Gemini"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Máx. {agent.max_messages_before_handoff} mensagens •{" "}
              {agent.handoff_keywords?.length
                ? `${agent.handoff_keywords.length} keyword(s)`
                : "Sem keywords"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={agent.is_active}
            onCheckedChange={(v) => updateAgent.mutate({ id: agent.id, is_active: v })}
          />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteAgent.mutate(agent.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conversation stats */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>{activeConvs} ativa(s)</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{handedOffConvs} transferida(s)</span>
        </div>
      </div>

      {/* Conversation history */}
      {conversations.length > 0 && (
        <Collapsible open={showConvs} onOpenChange={setShowConvs}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              {showConvs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Ver histórico ({conversations.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {conversations.slice(0, 10).map((conv) => {
              const statusInfo = STATUS_LABELS[conv.status] || { label: conv.status, variant: "outline" as const };
              return (
                <div key={conv.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50">
                  <span className="text-muted-foreground">
                    {new Date(conv.started_at).toLocaleDateString("pt-BR")} — {conv.message_count} msg(s)
                  </span>
                  <Badge variant={statusInfo.variant} className="text-xs">
                    {statusInfo.label}
                  </Badge>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function AIAgentTab() {
  const { data: agents = [], isLoading } = useAIAgents();
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Agente de IA para WhatsApp
            </CardTitle>
            <CardDescription>
              Configure um assistente de IA para responder automaticamente às mensagens recebidas via WhatsApp.
            </CardDescription>
          </div>
          {!showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Agente
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCreateForm && (
          <AgentForm onCancel={() => setShowCreateForm(false)} />
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : agents.length === 0 && !showCreateForm ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum agente configurado</p>
            <p className="text-sm mt-1">Clique em "Novo Agente" para criar seu primeiro assistente de IA.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
