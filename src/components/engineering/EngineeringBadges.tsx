import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProjectStatus = 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: 'Planejado',
  in_progress: 'Em Andamento',
  on_hold: 'Suspenso',
  completed: 'Concluído',
  cancelled: 'Cancelado'
};

export const projectStatusColors: Record<ProjectStatus, string> = {
  planned: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  in_progress: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  on_hold: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
};

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

export function ProjectStatusBadge({ status, className }: ProjectStatusBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn("font-medium", projectStatusColors[status], className)}
    >
      {projectStatusLabels[status]}
    </Badge>
  );
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';

export const milestoneStatusLabels: Record<MilestoneStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em Execução',
  completed: 'Concluído',
  delayed: 'Atrasado'
};

export const milestoneStatusColors: Record<MilestoneStatus, string> = {
  pending: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  in_progress: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  delayed: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
};

export function MilestoneStatusBadge({ status, className }: { status: MilestoneStatus; className?: string }) {
  return (
    <Badge 
      variant="outline" 
      className={cn("font-medium text-[10px] h-5", milestoneStatusColors[status], className)}
    >
      {milestoneStatusLabels[status]}
    </Badge>
  );
}
