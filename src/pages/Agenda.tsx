import { useState, useMemo, useEffect } from "react";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  Phone,
  Mail,
  Video,
  ClipboardList,
  Home,
  MessageSquare,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { CalendarView } from "@/components/schedule/CalendarView";
import { EventsList } from "@/components/schedule/EventsList";
import { EventSheet } from "@/components/schedule/EventSheet";
import { UserFilter } from "@/components/schedule/UserFilter";
import { useScheduleEvents, ScheduleEvent, useUpdateScheduleEvent } from "@/hooks/use-schedule-events";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ─── helpers ────────────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  call: { label: "Ligação", color: "#6366f1", bg: "rgba(99,102,241,0.18)", icon: Phone },
  email: { label: "E-mail", color: "#f59e0b", bg: "rgba(245,158,11,0.18)", icon: Mail },
  meeting: { label: "Reunião", color: "#8b5cf6", bg: "rgba(139,92,246,0.18)", icon: Video },
  task: { label: "Tarefa", color: "#f59e0b", bg: "rgba(245,158,11,0.18)", icon: ClipboardList },
  message: { label: "Mensagem", color: "#22c55e", bg: "rgba(34,197,94,0.18)", icon: MessageSquare },
  visit: { label: "Visita ao imóvel", color: "#ec4899", bg: "rgba(236,72,153,0.18)", icon: Home },
};

// ─── Componente principal ────────────────────────────────────────────────────


export default function Agenda() {
  const { profile } = useAuth();

  const { data: isTeamLeader = false } = useQuery({
    queryKey: ["is-team-leader", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return false;
      const { data } = await supabase.rpc("is_team_leader", { check_user_id: profile.id });
      return data || false;
    },
    enabled: !!profile?.id,
  });

  const { data: users = [] } = useUsers();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [pivotDate, setPivotDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"day" | "week" | "month" | "year" | "list">(() => {
    const saved = localStorage.getItem("agendaViewMode");
    return (saved as any) || "week";
  });
  useEffect(() => {
    localStorage.setItem("agendaViewMode", viewMode);
  }, [viewMode]);

  const [showThirtyMinLines, setShowThirtyMinLines] = useState(() => {
    const saved = localStorage.getItem("agendaShowThirtyMinLines");
    return saved === "true";
  });
  useEffect(() => {
    localStorage.setItem("agendaShowThirtyMinLines", String(showThirtyMinLines));
  }, [showThirtyMinLines]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetEvent, setSheetEvent] = useState<ScheduleEvent | null>(null);
  const updateEventMutation = useUpdateScheduleEvent();

  const dateRange = useMemo(() => {
    switch (viewMode) {
      case "day":
        return { startDate: startOfDay(pivotDate), endDate: endOfDay(pivotDate) };
      case "week":
        return {
          startDate: startOfWeek(pivotDate, { weekStartsOn: 0 }),
          endDate: endOfWeek(pivotDate, { weekStartsOn: 0 }),
        };
      case "month":
        return {
          startDate: startOfWeek(startOfMonth(pivotDate), { weekStartsOn: 0 }),
          endDate: endOfWeek(endOfMonth(pivotDate), { weekStartsOn: 0 }),
        };
      case "year":
        return { startDate: startOfYear(pivotDate), endDate: endOfYear(pivotDate) };
      default:
        return { startDate: startOfDay(new Date()), endDate: addDays(new Date(), 30) };
    }
  }, [pivotDate, viewMode]);

  const { data: events = [] } = useScheduleEvents({
    userId: selectedUserId || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date());
    const next = addDays(today, 7);
    return events
      .filter((ev) => {
        const d = new Date(ev.start_time);
        return d >= today && d <= next && ev.status !== "completed";
      })
      .slice(0, 10);
  }, [events]);

  const openCreateSheet = () => {
    setSheetEvent(null);
    setSheetOpen(true);
  };

  const openEventSheet = (event: ScheduleEvent) => {
    setSheetEvent(event);
    setSheetOpen(true);
  };


  const canFilterUsers = profile?.role === "admin" || isTeamLeader;

  const VIEW_MODES = [
    { value: "day", label: "Dia", icon: Clock },
    { value: "week", label: "Semana", icon: LayoutGrid },
    { value: "month", label: "Mês", icon: CalendarIcon },
    { value: "list", label: "Lista", icon: List },
  ];

  const TYPE_LEGEND = [
    { key: "call", label: "Ligação" },
    { key: "email", label: "E-mail" },
    { key: "meeting", label: "Reunião" },
    { key: "task", label: "Tarefa" },
    { key: "message", label: "Mensagem" },
    { key: "visit", label: "Visita ao imóvel" },
  ];

  const activeFiltersCount = (selectedUserId ? 1 : 0);

  return (
    <AppLayout title="Agenda" disableMainScroll={true}>
      <div
        style={{
          display: "flex",
          height: "100%",
          overflow: "hidden",
          borderRadius: 16,
          border: "0.5px solid rgba(255,255,255,0.07)",
          background: "var(--color-background-primary)",
        }}
      >
        {/* ── Área principal (calendário) ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {/* Header da agenda */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 18px",
              borderBottom: "0.5px solid rgba(255,255,255,0.07)",
            }}
          >
            <button
              style={{
                background: "rgba(255,78,26,0.15)",
                color: "#ff4e1a",
                border: "none",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => setPivotDate(new Date())}
            >
              Hoje
            </button>
            <div style={{ display: "flex", gap: 2 }}>
              <button
                style={{
                  background: "none",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "var(--color-text-secondary)",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() =>
                  setPivotDate((d) => addDays(d, viewMode === "week" ? -7 : viewMode === "month" ? -30 : -1))
                }
              >
                <ChevronLeft size={14} />
              </button>
              <button
                style={{
                  background: "none",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "var(--color-text-secondary)",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => setPivotDate((d) => addDays(d, viewMode === "week" ? 7 : viewMode === "month" ? 30 : 1))}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>
              {viewMode === "week"
                ? `${format(startOfWeek(pivotDate, { weekStartsOn: 0 }), "d", { locale: ptBR })} – ${format(endOfWeek(pivotDate, { weekStartsOn: 0 }), "d 'de' MMMM, yyyy", { locale: ptBR })}`
                : format(pivotDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Novo Botão de Filtros */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-9 gap-2 border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[var(--color-text-secondary)]",
                      activeFiltersCount > 0 && "text-[#ff4e1a] border-[#ff4e1a]/30 bg-[#ff4e1a]/10"
                    )}
                  >
                    <SlidersHorizontal size={14} />
                    <span>Filtros</span>
                    {activeFiltersCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 min-w-[20px] bg-[#ff4e1a] text-white hover:bg-[#ff4e1a]">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-popover border border-border shadow-xl z-50" align="end">
                  <div className="p-4 flex flex-col gap-6">
                    {/* Visualização */}
                    <div className="flex flex-col gap-3">
                      <SideLabel>Visualização</SideLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {VIEW_MODES.map((m) => {
                          const active = viewMode === m.value;
                          const Icon = m.icon;
                          return (
                            <button
                              key={m.value}
                              onClick={() => setViewMode(m.value as any)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                                active 
                                  ? "border-[#ff4e1a] bg-[#ff4e1a]/15 text-[#ff4e1a]" 
                                  : "border-[rgba(255,255,255,0.1)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[rgba(255,255,255,0.05)]"
                              )}
                            >
                              <Icon size={14} />
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Configurações de Grade */}
                    <div className="flex flex-col gap-3">
                      <SideLabel>Configurações</SideLabel>
                      <div className="flex items-center justify-between px-1">
                        <Label htmlFor="grid-lines" className="text-xs font-medium text-[var(--color-text-secondary)]">
                          Mostrar linhas de 30 min
                        </Label>
                        <Switch 
                          id="grid-lines" 
                          checked={showThirtyMinLines} 
                          onCheckedChange={setShowThirtyMinLines} 
                        />
                      </div>
                    </div>

                    {/* Filtro de Equipe */}
                    {canFilterUsers && (
                      <div className="flex flex-col gap-3">
                        <SideLabel>Filtro por Equipe</SideLabel>
                        <UserFilter 
                          users={users} 
                          selectedUserId={selectedUserId} 
                          onUserSelect={setSelectedUserId} 
                        />
                      </div>
                    )}

                    {(activeFiltersCount > 0) && (
                      <div className="pt-4 border-t border-[rgba(255,255,255,0.07)]">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-xs gap-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                          onClick={() => {
                            setSelectedUserId(null);
                          }}
                        >
                          <Trash2 size={13} />
                          Limpar filtros
                        </Button>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <button
                onClick={openCreateSheet}
                style={{
                  background: "#ff4e1a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  letterSpacing: "0.04em",
                }}
              >
                <Plus size={15} /> Novo
              </button>
            </div>
          </div>

          {/* Calendário / lista */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {viewMode !== "list" ? (
              <CalendarView
                events={events}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                pivotDate={pivotDate}
                onPivotChange={setPivotDate}
                viewMode={viewMode as any}
                onEditEvent={openEventSheet}
                onEventUpdate={(id, updates) => updateEventMutation.mutate({ id, ...updates })}
                showThirtyMinLines={showThirtyMinLines}
                onQuickCreate={(date) => {
                  setSelectedDate(date);
                  openCreateSheet();
                }}
              />
            ) : (
              <div style={{ height: "100%", padding: 24, overflowY: "auto" }}>
                <EventsList events={upcomingEvents} onEditEvent={openEventSheet} showUser={true} />
              </div>
            )}
          </div>

          {/* Legenda de tipos no rodapé */}
          <div
            style={{
              display: "none",
              gap: 16,
              justifyContent: "center",
              padding: "8px 0",
              borderTop: "0.5px solid rgba(255,255,255,0.07)",
            }}
          >
            {TYPE_LEGEND.map((t) => {
              const conf = EVENT_TYPE_CONFIG[t.key];
              return (
                <div
                  key={t.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: conf.color }} />
                  {t.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <EventSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        event={sheetEvent}
        defaultUserId={selectedUserId || profile?.id}
        defaultDate={selectedDate}
      />
    </AppLayout>
  );
}

// ─── Sub-componentes pequenos ────────────────────────────────────────────────

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        color: "var(--color-text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff4e1a" }} />
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: "0.5px", background: "rgba(255,255,255,0.07)" }} />;
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
