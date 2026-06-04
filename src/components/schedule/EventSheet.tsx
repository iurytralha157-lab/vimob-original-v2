import { useState, useEffect, useMemo, useRef } from "react";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, Mail, Calendar as CalendarIcon, MessageSquare, MapPin, X, User,
  Search, Clock, Plus, Send, Building2, Users, CheckCircle, Trash2, Lock,
  Video, ClipboardList, Eye, Repeat2, Menu, Briefcase, Paperclip,
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
  const [isAllDay, setIsAllDay] = useState(false);
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
      setIsAllDay(Boolean(event.is_all_day));
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
      setIsAllDay(false);
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
      is_all_day: isAllDay,
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
        className="!w-[calc(100vw-24px)] !max-w-[620px] flex max-h-[80vh] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#202124] p-0 text-white shadow-2xl [&>button.absolute.right-4.top-4]:hidden sm:inset-y-auto sm:right-auto sm:left-1/2 sm:top-1/2 sm:!w-[min(620px,calc(100vw-40px))] sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!max-w-[620px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{isExisting ? "Detalhes da atividade" : "Nova atividade"}</SheetTitle>
        </SheetHeader>

        <div className="flex h-12 shrink-0 items-center justify-between px-5 text-zinc-400">
          <Menu size={18} />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-3">
          <div className="pl-10">
            {locked ? (
              <h2 className="border-b border-primary/70 pb-2 text-[22px] font-normal leading-tight">{title || "Sem título"}</h2>
            ) : (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Adicionar título"
                className="h-11 rounded-none border-0 border-b border-primary/70 bg-transparent px-0 text-[22px] font-normal text-white shadow-none focus-visible:ring-0 placeholder:text-zinc-300"
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 pl-10">
            <button
              type="button"
              disabled={locked}
              onClick={() => selectedType === "task" && setSelectedType("meeting")}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-semibold transition",
                selectedType !== "task" ? "bg-sky-700 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10",
              )}
            >
              Evento
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setSelectedType("task")}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-semibold transition",
                selectedType === "task" ? "bg-sky-700 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10",
              )}
            >
              Tarefa
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/5 px-3 text-sm font-semibold text-zinc-300 opacity-80"
            >
              Agendamento de horários
              <span className="rounded-full bg-blue-300/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-200">Novo</span>
            </button>

            {!locked && (
              <Select value={selectedType} onValueChange={(value: EventType) => setSelectedType(value)}>
                <SelectTrigger className="h-9 w-[150px] border-0 bg-white/10 text-sm text-white">
                  <TypeIcon className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map(({ type, label }) => (
                    <SelectItem key={type} value={type}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {locked && (
            <AgendaRow icon={<Lock size={18} />}>
              <span className="text-sm text-zinc-400">Atividade concluída, somente leitura</span>
            </AgendaRow>
          )}

          <AgendaRow icon={<Clock size={19} />}>
            {locked ? (
              <div className="text-sm text-zinc-200">
                {date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "-"} · {time} - {endTimePreview || "-"}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_92px_14px_92px]">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" className="h-10 justify-start rounded-md bg-white/10 px-3 text-sm font-medium text-zinc-100 hover:bg-white/15 hover:text-white">
                        {date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 border-0 bg-white/10 text-sm text-white" disabled={isAllDay} />
                  <span className="hidden text-center text-zinc-400 sm:block">-</span>
                  <div className="flex h-10 items-center rounded-md bg-white/10 px-3 text-sm text-zinc-100">{endTimePreview || "--:--"}</div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(event) => setIsAllDay(event.target.checked)}
                      className="h-5 w-5 rounded-sm border-2 border-zinc-400 bg-transparent accent-blue-300"
                    />
                    Dia inteiro
                  </label>
                  <span className="text-sm font-medium text-blue-300">Fuso horário</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Select value={recurrenceRule} onValueChange={(value: any) => setRecurrenceRule(value)}>
                    <SelectTrigger className="h-10 w-[172px] border-0 bg-white/10 text-sm text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {recurrenceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={String(duration)} onValueChange={(value) => { setDuration(Number(value)); durationTouched.current = true; }}>
                    <SelectTrigger className="h-10 w-[126px] border-0 bg-white/10 text-sm text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {recurrenceRule !== "none" && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={recurrenceMode} onValueChange={(value: any) => setRecurrenceMode(value)}>
                      <SelectTrigger className="h-10 border-0 bg-white/10 text-sm text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Por quantidade</SelectItem>
                        <SelectItem value="until">Até uma data</SelectItem>
                      </SelectContent>
                    </Select>

                    {recurrenceMode === "count" ? (
                      <Input
                        type="number"
                        min={2}
                        max={52}
                        value={recurrenceCount}
                        onChange={(event) => setRecurrenceCount(Math.max(2, Math.min(52, Number(event.target.value) || 2)))}
                        className="h-10 border-0 bg-white/10 text-sm text-white"
                        aria-label="Quantidade de ocorrências"
                      />
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" className="h-10 justify-start bg-white/10 text-sm text-white hover:bg-white/15">
                            {recurrenceUntil ? format(recurrenceUntil, "dd/MM/yyyy") : "Repetir até"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={recurrenceUntil} onSelect={setRecurrenceUntil} locale={ptBR} />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}
              </div>
            )}
          </AgendaRow>

          <AgendaRow icon={<Users size={19} />}>
            <div className="flex min-h-10 items-center gap-2">
              {allAssignees.length > 0 ? (
                allAssignees.map((a) => (
                  <div key={a.id} className="group relative">
                    <Avatar className="h-8 w-8" title={a.name}>
                      <AvatarImage src={a.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">
                        {a.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {!locked && !a.primary && (
                      <button
                        onClick={() => {
                          if (a.pending) setPendingAssigneeIds((prev) => prev.filter((id) => id !== a.id));
                          else removeAssignee(a.id);
                        }}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#202124] bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remover responsável"
                      >
                        <X size={8} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-sm text-zinc-400">Adicionar convidados</span>
              )}
              {!locked && availableUsers.length > 0 && (
                <Popover open={showAssigneePicker} onOpenChange={setShowAssigneePicker}>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-zinc-500 text-zinc-300 hover:border-primary hover:text-primary">
                      <Plus size={14} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="start">
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
                              <Avatar className="mr-2 h-5 w-5">
                                <AvatarImage src={u.avatar_url || undefined} />
                                <AvatarFallback className="text-[10px]">{u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}</AvatarFallback>
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
                <SelectTrigger className="mt-2 h-10 border-0 bg-white/10 text-sm text-white">
                  <SelectValue placeholder="Responsável principal..." />
                </SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </AgendaRow>

          <AgendaRow icon={<User size={19} />}>
            {selectedLeadId ? (
              <div className="flex items-center justify-between gap-2">
                {isExisting ? (
                  <Link to={`/crm/pipelines?lead=${selectedLeadId}`} className="truncate text-sm font-medium text-blue-300 hover:text-blue-200">
                    {selectedLeadName || "Lead vinculado"}
                  </Link>
                ) : (
                  <span className="truncate text-sm text-zinc-100">{selectedLeadName}</span>
                )}
                {!locked && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setSelectedLeadId(null); setSelectedLeadName(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : !locked ? (
              <Popover open={showLeadSelector} onOpenChange={setShowLeadSelector}>
                <PopoverTrigger asChild>
                  <button type="button" className="h-10 text-left text-sm text-zinc-300 hover:text-white">Lead/cliente</button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
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
                            <User className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-medium">{l.name}</span>
                              <span className="truncate text-[10px] text-muted-foreground">{[l.phone, l.email].filter(Boolean).join(" · ") || "Sem contato"}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-sm text-zinc-400">Sem lead</span>
            )}
          </AgendaRow>

          <AgendaRow icon={<MapPin size={19} />}>
            {locked ? (
              <span className="text-sm text-zinc-300">{location || "Sem local"}</span>
            ) : (
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adicionar local" className="h-10 border-0 bg-transparent px-0 text-sm text-white shadow-none focus-visible:ring-0 placeholder:text-zinc-400" />
            )}
          </AgendaRow>

          <AgendaRow icon={<Building2 size={19} />}>
            {selectedPropertyId ? (
              <div className="flex items-center justify-between gap-2">
                <Link to={`/imoveis/${selectedPropertyId}`} className="truncate text-sm font-medium text-blue-300 hover:text-blue-200">
                  {selectedPropertyLabel || "Imóvel selecionado"}
                </Link>
                {!locked && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setSelectedPropertyId(null); setSelectedPropertyLabel(null); }}>
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
                trigger={<button type="button" className="h-10 text-left text-sm text-zinc-300 hover:text-white">Imóvel</button>}
              />
            ) : (
              <span className="text-sm text-zinc-400">Sem imóvel</span>
            )}
          </AgendaRow>

          <AgendaRow icon={<MessageSquare size={19} />}>
            {locked ? (
              <p className="text-sm text-zinc-300">{description || "Sem descrição"}</p>
            ) : (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicionar uma descrição"
                rows={2}
                className="min-h-[40px] resize-none border-0 bg-transparent px-0 text-sm text-white shadow-none focus-visible:ring-0 placeholder:text-zinc-400"
              />
            )}
          </AgendaRow>

          <AgendaRow icon={<Paperclip size={19} />}>
            <span className="text-sm font-medium text-blue-300">Adicionar um anexo</span>
          </AgendaRow>

          <AgendaRow icon={<Briefcase size={19} />}>
            <div className="flex flex-wrap gap-2">
              <Select value={primaryUserId} onValueChange={setPrimaryUserId} disabled={locked}>
                <SelectTrigger className="h-10 w-[150px] border-0 bg-white/10 text-sm text-white">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-md bg-white/10 px-4 text-sm text-white"
                disabled={locked}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: typeConf.color }} />
              </button>
            </div>
          </AgendaRow>

          {isExisting && (
            <AgendaRow icon={<MessageSquare size={19} />}>
              <div className="space-y-3">
                {comments.length === 0 && <p className="text-sm text-zinc-400">Nenhum comentário</p>}
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={c.user?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">{(c.user?.name || "U").split(" ").slice(0, 2).map((p) => p[0]).join("")}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-[10px] text-zinc-400">
                        <span className="font-medium text-zinc-100">{c.user?.name || "Usuário"}</span>
                        {" · "}{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                      <div className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-zinc-100">{c.content}</div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                    placeholder="Comentário..."
                    className="h-9 border-0 bg-white/10 text-xs text-white"
                    disabled={isAdding}
                  />
                  <Button size="icon" onClick={handleSendComment} disabled={isAdding || !commentText.trim()} className="h-9 w-9 shrink-0">
                    <Send size={13} />
                  </Button>
                </div>
              </div>
            </AgendaRow>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-3">
          {isExisting ? (
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
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {isExisting && !isCompleted && (
              <Button variant="ghost" size="sm" onClick={handleMarkDone} disabled={isLoading} className="gap-1.5 text-blue-300 hover:bg-white/10 hover:text-blue-200">
                <CheckCircle size={13} /> Concluir
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading} className="font-semibold text-blue-300 hover:bg-white/10 hover:text-blue-200">
              Mais opções
            </Button>
            {!locked && (
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isLoading} className="rounded-full bg-blue-300 px-7 text-sm font-semibold text-slate-900 hover:bg-blue-200">
                {isLoading ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AgendaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[40px_1fr] gap-2 border-b border-white/10 py-3 last:border-b-0">
      <div className="flex justify-center pt-2 text-zinc-400">{icon}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
