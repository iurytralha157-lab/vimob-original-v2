import { useState, useEffect, useMemo, useRef } from "react";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Mail, Calendar as CalendarIcon, MessageSquare, MapPin, X, User,
  Search, Clock, Plus, Send, Building2, Users, CheckCircle, Trash2, Lock,
  Video, ClipboardList, Eye, Repeat2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const recurrenceOptions = [
  { value: "none", label: "Não se repete" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
] as const;

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
  const locked = isCompleted;

  const [selectedType, setSelectedType] = useState<EventType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [primaryUserId, setPrimaryUserId] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const durationTouched = useRef(false);
  const [recurrenceRule, setRecurrenceRule] = useState<"none" | "weekly" | "monthly" | "yearly">("none");
  const [recurrenceMode, setRecurrenceMode] = useState<"count" | "until">("count");
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [recurrenceUntil, setRecurrenceUntil] = useState<Date | undefined>(undefined);

  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState<string | null>(null);
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const { data: searchedLeads = [] } = useLeads({ search: leadSearch, limit: 20 });

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedPropertyLabel, setSelectedPropertyLabel] = useState<string | null>(null);
  const { data: allProperties = [] } = useProperties();

  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [pendingAssigneeIds, setPendingAssigneeIds] = useState<string[]>([]);
  const { assignees, addAssignee, removeAssignee } = useScheduleEventAssignees(event?.id);
  const { comments, addComment, isAdding } = useScheduleComments(event?.id);
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (!open) return;
    if (event) {
      setSelectedType((event.event_type as EventType) || "task");
      setTitle(event.title || "");
      setDescription(event.description || "");
      setLocation(event.location || "");
      setPrimaryUserId(event.user_id || defaultUserId || "");
      setDate(event.start_time ? new Date(event.start_time) : getBrasiliaTime());
      setTime(event.start_time ? format(new Date(event.start_time), "HH:mm") : getCurrentTimeForInput());
      setSelectedLeadId(event.lead_id || null);
      setSelectedLeadName(event.lead?.name || null);
      setSelectedPropertyId((event as any).property_id || null);
      setSelectedPropertyLabel(
        (event as any).property
          ? `${(event as any).property.code ? `${(event as any).property.code} · ` : ""}${(event as any).property.title || "Imóvel"}`
          : null
      );
      setRecurrenceRule(((event as any).recurrence_rule as any) || "none");
      setRecurrenceMode((event as any).recurrence_until ? "until" : "count");
      setRecurrenceCount((event as any).recurrence_count || 4);
      setRecurrenceUntil((event as any).recurrence_until ? new Date((event as any).recurrence_until) : undefined);
      if (event.start_time && event.end_time) {
        const d = differenceInMinutes(new Date(event.end_time), new Date(event.start_time));
        setDuration(d > 0 ? d : 30);
      }
    } else {
      setSelectedType("task");
      setTitle("");
      setDescription("");
      setLocation("");
      setPrimaryUserId(defaultUserId || "");
      setDate(defaultDate || getBrasiliaTime());
      setTime(defaultDate ? format(defaultDate, "HH:mm") : getCurrentTimeForInput());
      setSelectedLeadId(leadId || null);
      setSelectedLeadName(leadName || null);
      setSelectedPropertyId(null);
      setSelectedPropertyLabel(null);
      setDuration(30);
      setRecurrenceRule("none");
      setRecurrenceMode("count");
      setRecurrenceCount(4);
      setRecurrenceUntil(undefined);
      durationTouched.current = false;
    }
    setPendingAssigneeIds([]);
    setCommentText("");
  }, [open, event, defaultUserId, defaultDate, leadId, leadName]);

  useEffect(() => {
    if (locked || durationTouched.current) return;
    setDuration(selectedType === "visit" || selectedType === "meeting" ? 60 : 30);
  }, [selectedType, locked]);

  const typeConf = eventTypes.find((t) => t.type === selectedType) || eventTypes[3];
  const TypeIcon = typeConf.icon;

  const endTimePreview = useMemo(() => {
    if (!date || !time) return "";
    const [hh, mm] = time.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
    const start = new Date(date);
    start.setHours(hh, mm, 0, 0);
    return format(addMinutes(start, duration), "HH:mm");
  }, [date, time, duration]);

  const allAssignees = useMemo(() => {
    const list: { id: string; name: string; avatar_url: string | null; primary: boolean; pending?: boolean }[] = [];
    const primary = users.find((u) => u.id === primaryUserId);
    if (primary) list.push({ ...primary, primary: true });

    assignees.forEach((a) => {
      if (a.id !== primaryUserId) list.push({ ...a, primary: false });
    });

    pendingAssigneeIds.forEach((id) => {
      const u = users.find((user) => user.id === id);
      if (u && !list.some((item) => item.id === u.id)) {
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
      location: location.trim() || undefined,
      recurrence_rule: !event ? recurrenceRule : undefined,
      recurrence_count: !event && recurrenceRule !== "none" && recurrenceMode === "count" ? recurrenceCount : undefined,
      recurrence_until: !event && recurrenceRule !== "none" && recurrenceMode === "until" && recurrenceUntil ? recurrenceUntil.toISOString() : undefined,
    };

    if (event) {
      await updateEvent.mutateAsync({ id: event.id, ...payload } as any);
    } else {
      const created = await createEvent.mutateAsync(payload);
      if (created?.id && pendingAssigneeIds.length > 0) {
        pendingAssigneeIds.forEach((userId) => addAssignee(userId));
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
        className="w-full p-0 flex flex-col bg-card border-l border-border shadow-2xl sm:inset-y-auto sm:right-auto sm:left-1/2 sm:top-1/2 sm:h-[80vh] sm:max-h-[80vh] sm:w-[min(900px,80vw)] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{isExisting ? "Detalhes da atividade" : "Nova atividade"}</SheetTitle>
        </SheetHeader>

        <div className="shrink-0 border-b border-white/10 bg-gradient-to-br from-muted/35 via-card to-background px-5 py-4 sm:px-6 sm:py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm"
              style={{ background: `${typeConf.color}20`, color: typeConf.color, border: `1px solid ${typeConf.color}40` }}
            >
              <TypeIcon size={11} />
              {typeConf.label}
            </span>
            {isExisting && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                  isCompleted ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                )}
              >
                {isCompleted ? "Concluída" : (event?.status === "confirmed" ? "Confirmado" : "Pendente")}
              </span>
            )}
          </div>

          {locked ? (
            <h2 className="text-2xl font-bold leading-tight text-foreground">{title || "Sem título"}</h2>
          ) : (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Adicionar título"
              className="h-auto border-0 border-b border-primary/60 rounded-none bg-transparent px-0 py-2 text-2xl font-bold focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
          )}
          {locked && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <Lock size={11} className="text-muted-foreground/70" /> Atividade concluída, somente leitura
            </div>
          )}
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 lg:grid-cols-2">
          <Field label="Tipo de atividade" icon={TypeIcon}>
            {locked ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: typeConf.color }} />
                {typeConf.label}
              </div>
            ) : (
              <Select value={selectedType} onValueChange={(value) => setSelectedType(value as EventType)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {eventTypes.map(({ type, label, icon: Icon, color }) => (
                    <SelectItem key={type} value={type}>
                      <span className="inline-flex items-center gap-2">
                        <Icon size={14} style={{ color }} />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Local" icon={MapPin}>
            {locked ? (
              <p className="text-sm text-muted-foreground">{location || "Sem local"}</p>
            ) : (
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adicionar local..." className="h-10 text-sm" />
            )}
          </Field>

          <Field label="Data, horário e repetição" icon={Clock} className="lg:col-span-2">
            <div className="space-y-3">
              {locked ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <CalendarIcon size={14} className="text-muted-foreground" />
                  <span>{date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "-"}</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{time} - {endTimePreview || "-"}</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{recurrenceOptions.find((opt) => opt.value === recurrenceRule)?.label || "Não se repete"}</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_120px_24px_120px_130px] md:items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-10 justify-start text-sm font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR} />
                      </PopoverContent>
                    </Popover>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 text-sm" />
                    <span className="hidden text-center text-muted-foreground md:block">-</span>
                    <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm">
                      {endTimePreview || "--:--"}
                    </div>
                    <Select value={String(duration)} onValueChange={(value) => { setDuration(Number(value)); durationTouched.current = true; }}>
                      <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {durationOptions.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_180px_1fr] md:items-center">
                    <Select value={recurrenceRule} onValueChange={(value: any) => setRecurrenceRule(value)}>
                      <SelectTrigger className="h-10 text-sm">
                        <Repeat2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {recurrenceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {recurrenceRule !== "none" && (
                      <Select value={recurrenceMode} onValueChange={(value: any) => setRecurrenceMode(value)}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="count">Por quantidade</SelectItem>
                          <SelectItem value="until">Até uma data</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {recurrenceRule !== "none" && recurrenceMode === "count" && (
                      <Input
                        type="number"
                        min={2}
                        max={52}
                        value={recurrenceCount}
                        onChange={(event) => setRecurrenceCount(Math.max(2, Math.min(52, Number(event.target.value) || 2)))}
                        className="h-10 text-sm"
                        aria-label="Quantidade de ocorrências"
                      />
                    )}

                    {recurrenceRule !== "none" && recurrenceMode === "until" && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-10 justify-start text-sm font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {recurrenceUntil ? format(recurrenceUntil, "dd/MM/yyyy") : "Repetir até"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={recurrenceUntil} onSelect={setRecurrenceUntil} locale={ptBR} />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </>
              )}
            </div>
          </Field>

          <Field label="Usuários responsáveis" icon={Users}>
            <div className="flex items-center gap-2 flex-wrap">
              {allAssignees.map((a) => (
                <div key={a.id} className="group relative">
                  <Avatar
                    className={cn("h-8 w-8 ring-2 ring-background transition-transform hover:scale-105", a.primary ? "ring-primary/20" : "ring-background")}
                    title={a.name}
                  >
                    <AvatarImage src={a.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                      {a.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!locked && !a.primary && (
                    <button
                      onClick={() => {
                        if (a.pending) setPendingAssigneeIds((prev) => prev.filter((id) => id !== a.id));
                        else removeAssignee(a.id);
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
                                if (isExisting) addAssignee(u.id);
                                else if (!primaryUserId) setPrimaryUserId(u.id);
                                else if (!pendingAssigneeIds.includes(u.id)) setPendingAssigneeIds((prev) => [...prev, u.id]);
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
                <SelectTrigger className="mt-2 h-9 text-xs"><SelectValue placeholder="Selecione o responsável principal..." /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Lead / cliente" icon={User}>
            {selectedLeadId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                {isExisting ? (
                  <Link to={`/crm/pipelines?lead=${selectedLeadId}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
                    {selectedLeadName || "Lead vinculado"}
                  </Link>
                ) : (
                  <span className="text-sm font-medium truncate">{selectedLeadName}</span>
                )}
                {!locked && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSelectedLeadId(null); setSelectedLeadName(null); }}>
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

          <Field label="Imóvel" icon={Building2}>
            {selectedPropertyId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <Link to={`/imoveis/${selectedPropertyId}`} className="text-sm font-medium hover:text-primary transition-colors truncate">
                  {selectedPropertyLabel || "Imóvel selecionado"}
                </Link>
                {!locked && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSelectedPropertyId(null); setSelectedPropertyLabel(null); }}>
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
                  setSelectedPropertyLabel(`${p.code ? `${p.code} · ` : ""}${p.title || "Imóvel"}`);
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

          <Field label="Descrição" className="lg:col-span-2">
            {locked ? (
              <p className="text-sm text-muted-foreground italic">{description || "Sem descrição"}</p>
            ) : (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicionar descrição..."
                rows={3}
                className="text-sm resize-none"
              />
            )}
          </Field>

          {isExisting && (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 lg:col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare size={11} /> Comentários
              </div>
              <div className="flex flex-col gap-2.5 mb-2.5">
                {comments.length === 0 && <p className="text-xs text-muted-foreground/70 text-center py-2">Nenhum comentário</p>}
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
                      <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs break-words">{c.content}</div>
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
                <Button size="icon" onClick={handleSendComment} disabled={isAdding || !commentText.trim()} className="h-9 w-9 shrink-0">
                  <Send size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>

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
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
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
  label, children, icon: Icon, className,
}: { label: string; children: React.ReactNode; icon?: React.ElementType; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-white/10 bg-white/[0.025] p-3", className)}>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon size={11} />} {label}
      </div>
      {children}
    </section>
  );
}
