import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Edit2, Trash2, Play, MessageSquare, Clock, GitBranch, Tag, UserPlus,
  Zap, Loader2, CheckCircle2, XCircle, AlertCircle, History, MapPin, Copy,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  useAutomations, useDeleteAutomation, useToggleAutomation, useAutomationExecutions,
  useCreateAutomation,
  TRIGGER_TYPE_LABELS, TriggerType, Automation, FlowDefinition,
} from '@/hooks/use-automations';
import { usePipelines, useStages } from '@/hooks/use-stages';
import { useTags } from '@/hooks/use-tags';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { useQueryClient } from '@tanstack/react-query';

interface AutomationListProps {
  onEdit: (automationId: string) => void;
  onViewHistory?: (automationId: string) => void;
}

function TriggerContext({ automation }: { automation: Automation }) {
  const config = automation.trigger_config as Record<string, unknown> || {};
  const triggerType = automation.trigger_type as TriggerType;
  const pipelineId = config.pipeline_id as string | undefined;
  const stageId = config.to_stage_id as string | undefined;
  const tagId = config.tag_id as string | undefined;
  const { data: pipelines } = usePipelines();
  const { data: stages } = useStages(pipelineId);
  const { data: tags } = useTags();

  if (triggerType === 'lead_stage_changed' && pipelineId) {
    const pipeline = pipelines?.find(p => p.id === pipelineId);
    const stage = stageId ? stages?.find(s => s.id === stageId) : null;
    if (!pipeline && !stage) return null;
    return (
        <span className="text-xs text-muted-foreground">
        {pipeline?.name || '—'}{stage ? ` → ${stage.name}` : ''}
      </span>
    );
  }

  if (triggerType === 'tag_added' && tagId) {
    const tag = tags?.find(t => t.id === tagId);
    if (!tag) return null;
    return (
      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: tag.color ? `${tag.color}22` : undefined, color: tag.color || undefined }}>
        {tag.name}
      </span>
    );
  }

  return null;
}

export function AutomationList({ onEdit, onViewHistory }: AutomationListProps) {
  const { data: automations, isLoading } = useAutomations();
  const { data: executions } = useAutomationExecutions();
  const deleteAutomation = useDeleteAutomation();
  const toggleAutomation = useToggleAutomation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const getExecutionStats = (automationId: string) => {
    const automationExecutions = executions?.filter(e => e.automation_id === automationId) || [];
    return {
      running: automationExecutions.filter(e => e.status === 'running' || e.status === 'waiting').length,
      completed: automationExecutions.filter(e => e.status === 'completed').length,
      failed: automationExecutions.filter(e => e.status === 'failed').length,
      lastRun: automationExecutions.length > 0 ? new Date(automationExecutions[0].started_at) : null,
    };
  };

  const handleDuplicate = async (automation: Automation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!profile?.organization_id) return;

      const { error } = await supabase
        .from('automations')
        .insert([{
          organization_id: profile.organization_id,
          name: `${automation.name} (cópia)`,
          description: automation.description || null,
          trigger_type: automation.trigger_type,
          trigger_config: automation.trigger_config as Json,
          flow_definition: (automation.flow_definition || null) as unknown as Json,
          created_by: profile.id,
          is_active: false,
        }])
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automação duplicada com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao duplicar: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automations || automations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-2xl bg-primary/10 mb-4">
          <Zap className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Nenhuma automação criada</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Vá para a aba "Modelos" para criar sua primeira automação a partir de templates prontos
        </p>
      </div>
    );
  }

  const getNodeCount = (automation: Automation) => {
    const flow = automation.flow_definition as unknown as Record<string, unknown> | null;
    if (!flow) return 0;
    const nodes = flow.nodes as unknown[] | undefined;
    return nodes?.length || 0;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {automations.map((automation) => {
        const stats = getExecutionStats(automation.id);
        const hasStats = stats.running > 0 || stats.completed > 0 || stats.failed > 0;
        
        return (
          <div 
            key={automation.id} 
            className={`group rounded-2xl cursor-pointer relative aspect-[4/3] flex items-center justify-center transition-all duration-200 overflow-hidden border border-border bg-secondary hover:bg-orange-500 hover:border-orange-500 ${
              !automation.is_active ? 'opacity-50' : ''
            }`}
            onClick={() => onEdit(automation.id)}
          >
            <div className="flex flex-col items-center justify-center p-4 text-center w-full relative z-10">
              <div className="relative mb-2">
                <div className={`p-2.5 rounded-xl transition-all duration-200 group-hover:scale-110 group-hover:bg-white/20 ${automation.is_active ? 'bg-primary/15' : 'bg-muted'}`}>
                  <Zap className={`h-6 w-6 group-hover:text-white ${automation.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                {stats.running > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
                )}
              </div>

              <h3 className="font-semibold text-xs mb-0.5 truncate max-w-full text-foreground group-hover:text-white">{automation.name}</h3>
              
              <span className="text-[10px] text-muted-foreground group-hover:text-white/70 mb-0.5">
                {TRIGGER_TYPE_LABELS[automation.trigger_type as TriggerType] || automation.trigger_type}
              </span>

              {hasStats && (
                <div className="flex items-center gap-1.5 text-[10px] mb-0.5">
                  {stats.completed > 0 && (
                    <span className="flex items-center gap-0.5 text-muted-foreground group-hover:text-white/80">
                      <CheckCircle2 className="h-2.5 w-2.5 text-green-400 group-hover:text-white/80" />
                      {stats.completed}
                    </span>
                  )}
                  {stats.running > 0 && (
                    <span className="flex items-center gap-0.5 text-primary group-hover:text-white/80">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {stats.running}
                    </span>
                  )}
                  {stats.failed > 0 && (
                    <span className="flex items-center gap-0.5 text-red-400 group-hover:text-white/80">
                      <XCircle className="h-2.5 w-2.5" />
                      {stats.failed}
                    </span>
                  )}
                </div>
              )}

              {automation.created_at && (
                <span className="text-[9px] text-muted-foreground/60 group-hover:text-white/50">
                  {format(new Date(automation.created_at), "dd/MM/yyyy")}
                </span>
              )}
            </div>

            {/* Top-right actions (visible on hover) */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20" onClick={(e) => e.stopPropagation()}>
              <Switch 
                checked={automation.is_active}
                onCheckedChange={(checked) => toggleAutomation.mutate({ id: automation.id, is_active: checked })}
                className="scale-75 data-[state=checked]:bg-green-500"
                onClick={(e) => e.stopPropagation()}
                title={automation.is_active ? "Desativar" : "Ativar"}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
                onClick={(e) => handleDuplicate(automation, e)}
                title="Duplicar"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. A automação "{automation.name}" será excluída permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAutomation.mutate(automation.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Status badge - green solid for active */}
            <Badge 
              className={`absolute top-1.5 left-1.5 text-[10px] px-2 py-0.5 font-medium border-0 ${
                automation.is_active 
                  ? 'bg-green-500 text-white' 
                  : 'bg-muted text-muted-foreground group-hover:bg-white/20 group-hover:text-white'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                automation.is_active ? 'bg-white' : 'bg-muted-foreground'
              }`} />
              {automation.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
