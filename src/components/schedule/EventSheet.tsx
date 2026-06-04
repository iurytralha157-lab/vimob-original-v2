import { useState, useEffect, useMemo, useRef } from "react";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Mail, Calendar as CalendarIcon, CheckSquare, MessageSquare,
  MapPin, X, User, Search, Clock, Plus, Send, Building2, Users,
  CheckCircle, CheckCircle2, Trash2, Lock, Edit2, Video, ClipboardList, Eye,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn, getCurrentTimeForInput, getBrasiliaTime } from "@/lib/utils";
import {
  useCreateScheduleEvent, useUpdateScheduleEvent, useDeleteScheduleEvent,
  EventType, ScheduleEvent,
} from "@/hooks/use-schedule-events";
import { useUsers } from "@/hooks/use-users";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { useScheduleComments } from "@/hooks/use-schedule-comments";
import { useScheduleEventAssignees } from "@/hooks/use-schedule-event-assignees";
import { Link } from "react-router-dom";
import { PropertyPickerDialog } from "@/components/properties/PropertyPickerDialog";

const eventTypes: { type: EventType; label: string; icon: React.ElementType; color: string }[] = [
  { type: "call", label: "Ligação", icon: Phone, color: "#6366f1" },
  { type: "email", label: "E-mail", icon: Mail, color: "#f59e0b" },
  { type: "meeting", label: "Reunião", icon: Video, color: "#8b5cf6" },
  { type: "task", label: "Tarefa", icon: ClipboardList, color: "#f59e0b" },
  { type: "message", label: "Mensagem", icon: MessageSquare, color: "#22c55e" },
  { type: "visit", label: "Visita", icon: Eye, color: "#ec4899" },
];

const durationOptions = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
];

interface EventSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: ScheduleEvent | null;
  defaultUserId?: string;
  defaultDate?: Date;
  leadId?: string;
  leadName?: string;
}

export function EventSheet({
  open, onOpenChange, event, defaultUserId, defaultDate, leadId, leadName,
}: EventSheetProps) {
  const { data: users = [] } = useUsers();
  const createEvent = useCreateScheduleEvent();
  const updateEvent = useUpdateScheduleEvent();
  const deleteEvent = useDeleteScheduleEvent();

  const isExisting = !!event;
  const isCompleted = event?.status === "completed";
  const locked = isCompleted; // bloqueado quando concluído

  // ── estado do formulário ────────────────────────────
  const [selectedType, setSelectedType] = useState<EventType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryUserId, setPrimaryUserId] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const durationTouched = useRef(false);

  // Lead selector
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState<string | null>(null);
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const { data: searchedLeads = [] } = useLeads({ search: leadSearch, limit: 20 });

  // Property selector (only for "visit" type)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedPropertyLabel, setSelectedPropertyLabel] = useState<string | null>(null);
  const { data: allProperties = [] } = useProperties();


  // Assignee picker
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [pendingAssigneeIds, setPendingAssigneeIds] = useState<string[]>([]);
  const { assignees, addAssignee, removeAssignee } = useScheduleEventAssignees(event?.id);
  const { comments, addComment, isAdding } = useScheduleComments(event?.id);
  const [commentText, setCommentText] = useState("");

  // Reset quando abrir
  useEffect(() => {
    if (!open) return;
    if (event) {
      setSelectedType((event.event_type as EventType) || "task");
      setTitle(event.title || "");
      setDescription(event.description || "");
      setPrimaryUserId(event.user_id || defaultUserId || "");
      setDate(event.start_time ? new Date(event.start_time) : getBrasiliaTime());
      setTime(event.start_time ? format(new Date(event.start_time), "HH:mm") : getCurrentTimeForInput());
      setSelectedLeadId(event.lead_id || null);
      setSelectedLeadName(event.lead?.name || null);
      setSelectedPropertyId((event as any).property_id || null);
      setSelectedPropertyLabel(
        (event as any).property
          ? `${(event as any).property.code ? (event as any).property.code + ' · ' : ''}${(event as any).property.title || 'Imóvel'}`
          : null
      );
      if (event.start_time && event.end_time) {
        const d = differenceInMinutes(new Date(event.end_time), new Date(event.start_time));
        setDuration(d > 0 ? d : 30);
      }
    } else {
      setSelectedType("task");
      setTitle("");
      setDescription("");
      setPrimaryUserId(defaultUserId || "");
      setDate(defaultDate || getBrasiliaTime());
      setTime(defaultDate ? format(defaultDate, "HH:mm") : getCurrentTimeForInput());
      setSelectedLeadId(leadId || null);
      setSelectedLeadName(leadName || null);
      setSelectedPropertyId(null);
      setSelectedPropertyLabel(null);
      setDuration(30);
      durationTouched.current = false;
    }
    setPendingAssigneeIds([]);
    setCommentText("");
  }, [open, event, defaultUserId, defaultDate, leadId, leadName]);

  // Efeito para ajustar duração padrão
  useEffect(() => {
    if (locked || durationTouched.current) return;
    if (selectedType === "visit" || selectedType === "meeting") {
      setDuration(60);
    } else {
      setDuration(30);
    }
  }, [selectedType, locked]);

  const typeConf = eventTypes.find((t) => t.type === selectedType) || eventTypes[3];
  const TypeIcon = typeConf.icon;

  // Lista combinada de responsáveis (principal + assignees + pendentes)
  const allAssignees = useMemo(() => {
    const list: { id: string; name: string; avatar_url: string | null; primary: boolean; pending?: boolean }[] = [];
    const primary = users.find((u) => u.id === primaryUserId);
    if (primary) list.push({ ...primary, primary: true });
    
    // Assignees vindos do banco
    assignees.forEach((a) => {
      if (a.id !== primaryUserId) list.push({ ...a, primary: false });
    });

    // Assignees pendentes (em criação)
    pendingAssigneeIds.forEach(id => {
      const u = users.find(user => user.id === id);
      if (u && !list.some(item => item.id === u.id)) {
        list.push({ ...u, primary: false, pending: true });
      }
    });

    return list;
  }, [users, primaryUserId, assignees, pendingAssigneeIds]);

  const availableUsers = users.filter(
    (u) => u.id !== primaryUserId && !assignees.some((a) => a.id === u.id) && !pendingAssigneeIds.includes(u.id),
  );

  const handleSubmit = async () => {
    if (!title.trim() || !date || !primaryUserId) return;
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(date);
    start.setHours(hh, mm, 0, 0);
    const end = addMinutes(start, duration);

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      event_type: selectedType,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_all_day: false,
      user_id: primaryUserId,
      lead_id: selectedLeadId,
      property_id: selectedType === "visit" ? selectedPropertyId : null,
    };

    if (event) {
      await updateEvent.mutateAsync({ id: event.id, ...payload } as any);
    } else {
      const created = await createEvent.mutateAsync(payload);
      // Se houver responsáveis pendentes, adiciona-os agora
      if (created?.id && pendingAssigneeIds.length > 0) {
        // Dispara inserções em paralelo, mas não precisa travar o fechamento da Sheet
        pendingAssigneeIds.forEach(userId => {
          addAssignee(userId);
        });
      }
    }
    onOpenChange(false);
  };

  const handleMarkDone = async () => {
    if (!event) return;
    await updateEvent.mutateAsync({ id: event.id, status: "completed" });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!event) return;
    await deleteEvent.mutateAsync({ id: event.id });
    onOpenChange(false);
  };

  const handleSendComment = () => {
    if (!commentText.trim() || isAdding) return;
    addComment(commentText.trim());
    setCommentText("");
  };

  const isLoading = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;
  const canSubmit = !locked && title.trim() && date && primaryUserId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] p-0 flex flex-col bg-card border-l border-border shadow-2xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{isExisting ? "Detalhes da Atividade" : "Nova Atividade"}</SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0 bg-muted/20">
          <div className="flex items-center justify-between mb-3">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-sm"
              style={{ background: `${typeConf.color}20`, color: typeConf.color, border: `1px solid ${typeConf.color}40` }}
            >
              <TypeIcon size={11} />
              {typeConf.label}
            </span>
            {isExisting && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-sm",
                  isCompleted ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                )}
              >
                {isCompleted ? "Concluída" : (event?.status === "confirmed" ? "Confirmado" : "Pendente")}
              </span>
            )}
          </div>
          {locked ? (
            <h2 className="text-xl font-bold text-foreground leading-tight">{title || "Sem título"}</h2>
          ) : (
            <div className="bg-muted/40 rounded-lg px-3 py-1.5 focus-within:ring-1 focus-within:ring-primary/50 transition-all border border-transparent focus-within:border-primary/20">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da atividade"
                className="text-xl font-bold h-auto border-0 bg-transparent px-0 py-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
              />
            </div>
          )}
          {locked && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <Lock size={11} className="text-muted-foreground/70" /> Atividade concluída — somente leitura
            </div>
          )}
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Tipo */}
          {!locked && (
            <Field label="Tipo de atividade">
              <div className="flex flex-wrap gap-1.5">
                {eventTypes.map(({ type, label, icon: Icon, color }) => {
                  const active = selectedType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all",
                        active
                          ? "border-transparent text-white"
                          : "border-white/10 text-muted-foreground hover:border-white/20",
                      )}
                      style={active ? { background: color } : undefined}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Lead */}
          <Field label="Lead / Cliente" icon={Building2}>
            {selectedLeadId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                {isExisting && selectedLeadId ? (
                  <Link
                    to={`/crm/pipelines?lead=${selectedLeadId}`}
                    className="text-sm font-medium hover:text-primary transition-colors truncate"
                  >
                    {selectedLeadName || "Lead vinculado"}
                  </Link>
                ) : (
                  <span className="text-sm font-medium truncate">{selectedLeadName}</span>
                )}
                {!locked && (
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                    onClick={() => { setSelectedLeadId(null); setSelectedLeadName(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : !locked ? (
              <Popover open={showLeadSelector} onOpenChange={setShowLeadSelector}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground border-dashed">
                    <Search className="mr-2 h-3 w-3" /> Vincular um lead...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[360px]" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Buscar por nome, telefone ou e-mail..." value={leadSearch} onValueChange={setLeadSearch} />
                    <CommandList>
                      <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                      <CommandGroup>
                        {searchedLeads.map((l) => (
                          <CommandItem
                            key={l.id}
                            value={l.id}
                            onSelect={() => {
                              setSelectedLeadId(l.id);
                              setSelectedLeadName(l.name);
                              setShowLeadSelector(false);
                              setLeadSearch("");
                            }}
                          >
                            <User className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">{l.name}</span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {[l.phone, l.email].filter(Boolean).join(" · ") || "Sem contato"}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-sm text-muted-foreground">Sem lead</span>
            )}
          </Field>

          {/* Imóvel */}
          <Field label={selectedType === "visit" ? "Imóvel da visita" : "Imóvel vinculado"} icon={Building2}>
            {selectedPropertyId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <Link
                  to={`/imoveis/${selectedPropertyId}`}
                  className="text-sm font-medium hover:text-primary transition-colors truncate"
                >
                  {selectedPropertyLabel || "Imóvel selecionado"}
                </Link>
                {!locked && (
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                    onClick={() => { setSelectedPropertyId(null); setSelectedPropertyLabel(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : !locked ? (
              <PropertyPickerDialog
                properties={allProperties as any}
                selectedPropertyId={selectedPropertyId}
                onSelect={(p) => {
                  setSelectedPropertyId(p.id);
                  setSelectedPropertyLabel(
                    `${p.code ? p.code + ' · ' : ''}${p.title || 'Imóvel'}`
                  );
                }}
                trigger={
                  <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground border-dashed">
                    <Search className="mr-2 h-3 w-3" /> Vincular um imóvel...
                  </Button>
                }
              />
            ) : (
              <span className="text-sm text-muted-foreground">Sem imóvel</span>
            )}
          </Field>



          {/* Responsáveis */}
          <Field label="Responsáveis" icon={Users}>
            <div className="flex items-center gap-2 flex-wrap">
              {allAssignees.map((a) => (
                <div key={a.id} className="group relative">
                  <Avatar className={cn(
                    "h-8 w-8 ring-2 ring-background transition-transform hover:scale-105",
                    a.primary ? "ring-primary/20" : "ring-background"
                  )} title={a.name}>
                    <AvatarImage src={a.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                      {a.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!locked && !a.primary && (
                    <button
                      onClick={() => {
                        if (a.pending) {
                          setPendingAssigneeIds(prev => prev.filter(id => id !== a.id));
                        } else {
                          removeAssignee(a.id);
                        }
                      }}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-background"
                      aria-label="Remover responsável"
                    >
                      <X size={8} strokeWidth={3} />
                    </button>
                  )}
                </div>
              ))}
              {!locked && availableUsers.length > 0 && (
                <Popover open={showAssigneePicker} onOpenChange={setShowAssigneePicker}>
                  <PopoverTrigger asChild>
                    <button
                      className="h-8 w-8 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center transition-colors bg-muted/20"
                      type="button"
                    >
                      <Plus size={14} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[260px]" align="start">
                    <Command>
                      <CommandInput placeholder="Adicionar responsável..." />
                      <CommandList>
                        <CommandEmpty>Sem usuários disponíveis.</CommandEmpty>
                        <CommandGroup>
                          {availableUsers.map((u) => (
                            <CommandItem
                              key={u.id}
                              onSelect={() => {
                                if (isExisting) {
                                  addAssignee(u.id);
                                } else {
                                  if (!primaryUserId) {
                                    setPrimaryUserId(u.id);
                                  } else if (!pendingAssigneeIds.includes(u.id)) {
                                    setPendingAssigneeIds(prev => [...prev, u.id]);
                                  }
                                }
                                setShowAssigneePicker(false);
                              }}
                            >
                              <Avatar className="h-5 w-5 mr-2">
                                <AvatarImage src={u.avatar_url || undefined} />
                                <AvatarFallback className="text-[10px]">
                                  {u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{u.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {!locked && !primaryUserId && (
              <Select value={primaryUserId} onValueChange={setPrimaryUserId}>
                <SelectTrigger className="mt-2 h-9 text-xs">
                  <SelectValue placeholder="Selecione o responsável principal..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Data / Hora / Duração */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Data">
              {locked ? (
                <p className="text-sm">{date ? format(date, "dd/MM/yyyy") : "-"}</p>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start text-xs h-9 font-normal">
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {date ? format(date, "dd/MM/yy") : "—"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              )}
            </Field>
            <Field label="Hora">
              {locked ? (
                <p className="text-sm">{time}</p>
              ) : (
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 text-xs" />
              )}
            </Field>
            <Field label="Duração">
              {locked ? (
                <p className="text-sm">{durationOptions.find((d) => d.value === duration)?.label}</p>
              ) : (
                <Select value={String(duration)} onValueChange={(v) => { setDuration(Number(v)); durationTouched.current = true; }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          {/* Descrição */}
          <Field label="Descrição">
            {locked ? (
              <p className="text-sm text-muted-foreground italic">{description || "Sem descrição"}</p>
            ) : (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicione observações..."
                rows={3}
                className="text-sm resize-none"
              />
            )}
          </Field>

          {/* Comentários — só quando o evento já existe */}
          {isExisting && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare size={11} /> Comentários
              </div>
              <div className="flex flex-col gap-2.5 mb-2.5">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground/70 text-center py-2">Nenhum comentário</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={c.user?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(c.user?.name || "U").split(" ").slice(0, 2).map((p) => p[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground mb-0.5">
                        <span className="font-medium text-foreground">{c.user?.name || "Usuário"}</span>
                        {" · "}{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs break-words">
                        {c.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                  placeholder="Comentário..."
                  className="h-9 text-xs"
                  disabled={isAdding}
                />
                <Button
                  size="icon"
                  onClick={handleSendComment}
                  disabled={isAdding || !commentText.trim()}
                  className="h-9 w-9 shrink-0"
                >
                  <Send size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3 shrink-0 flex items-center justify-between gap-2">
          {isExisting && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            {isExisting && !isCompleted && (
              <Button variant="outline" size="sm" onClick={handleMarkDone} disabled={isLoading} className="gap-1.5">
                <CheckCircle size={13} /> Concluir
              </Button>
            )}
            {!locked && (
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isLoading}>
                {isLoading ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label, children, icon: Icon,
}: { label: string; children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </div>
      {children}
    </div>
  );
}
