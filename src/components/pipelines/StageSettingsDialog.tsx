import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ColorPicker } from '@/components/ui/color-picker';
import { Plus, Trash2, Phone, MessageCircle, Mail, FileText, Clock, Loader2, Lock, Pencil, Check, X } from 'lucide-react';
import { useCadenceTemplates, useCreateCadenceTask, useDeleteCadenceTask, useUpdateCadenceTask } from '@/hooks/use-cadences';
import { useCanEditCadences } from '@/hooks/use-can-edit-cadences';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AutomationForm } from '@/components/automations/AutomationForm';
import { AutomationsList } from '@/components/automations/AutomationsList';
import { StageAutomation } from '@/hooks/use-stage-automations';

interface StageSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: {
    id: string;
    name: string;
    color: string;
    stage_key: string;
    pipeline_id?: string;
  } | null;
  onStageUpdate: () => void;
}

const taskTypeIcons: Record<string, typeof Phone> = {
  call: Phone,
  message: MessageCircle,
  email: Mail,
  note: FileText,
};

const taskTypeLabels: Record<string, string> = {
  call: 'Ligação',
  message: 'Mensagem',
  email: 'Email',
  note: 'Observação',
};

export function StageSettingsDialog({ 
  open, 
  onOpenChange, 
  stage, 
  onStageUpdate 
}: StageSettingsDialogProps) {
  const [name, setName] = useState(stage?.name || '');
  const [color, setColor] = useState(stage?.color || '#22c55e');
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = useCanEditCadences();
  
  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState({
    dayOffset: 1,
    type: 'call' as 'call' | 'message' | 'email' | 'note',
    title: ''
  });
  const [newTask, setNewTask] = useState({ 
    dayOffset: 1, 
    type: 'call' as 'call' | 'message' | 'email' | 'note', 
    title: '' 
  });
  
  // Automation state
  const [automationFormOpen, setAutomationFormOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<StageAutomation | null>(null);
  
  const { data: templates = [] } = useCadenceTemplates();
  const createTask = useCreateCadenceTask();
  const updateTask = useUpdateCadenceTask();
  const deleteTask = useDeleteCadenceTask();
  
  // Find the cadence template for this stage
  const stageTemplate = templates.find(t => t.stage_key === stage?.stage_key);
  
  // Update local state when stage changes
  useEffect(() => {
    if (stage) {
      setName(stage.name);
      setColor(stage.color || '#22c55e');
    }
  }, [stage]);
  
  const handleSaveGeneral = async () => {
    if (!stage) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('stages')
        .update({ name, color })
        .eq('id', stage.id);
      
      if (error) throw error;
      toast.success('Configurações salvas!');
      onStageUpdate();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleAddTask = async () => {
    if (!stageTemplate || !newTask.title) return;
    
    await createTask.mutateAsync({
      cadence_template_id: stageTemplate.id,
      day_offset: newTask.dayOffset,
      type: newTask.type,
      title: newTask.title,
    });
    
    setTaskDialogOpen(false);
    setNewTask({ dayOffset: 1, type: 'call', title: '' });
  };
  
  const handleDeleteTask = async (taskId: string) => {
    await deleteTask.mutateAsync(taskId);
  };

  const handleStartEditTask = (task: any) => {
    setEditingTaskId(task.id);
    setEditingTask({
      dayOffset: task.day_offset ?? 0,
      type: (task.type || 'call') as 'call' | 'message' | 'email' | 'note',
      title: task.title || '',
    });
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditingTask({ dayOffset: 1, type: 'call', title: '' });
  };

  const handleSaveTask = async () => {
    if (!editingTaskId || !editingTask.title.trim()) return;

    await updateTask.mutateAsync({
      id: editingTaskId,
      day_offset: editingTask.dayOffset,
      type: editingTask.type,
      title: editingTask.title.trim(),
    });

    handleCancelEditTask();
  };

  if (!stage) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-[650px] sm:max-w-[650px] p-6 flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurações da Coluna</SheetTitle>
        </SheetHeader>
        
        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="general" className="text-xs"><span className="sm:hidden">Conf. Gerais</span><span className="hidden sm:inline">Configurações Gerais</span></TabsTrigger>
            <TabsTrigger value="cadence" className="text-xs"><span className="sm:hidden">Cadência</span><span className="hidden sm:inline">Cadência de tarefas</span></TabsTrigger>
            <TabsTrigger value="automations" className="text-xs"><span className="sm:hidden">Automações</span><span className="hidden sm:inline">Automações</span></TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-4">
            {!canEdit && (
              <Badge variant="secondary" className="gap-1 mb-4">
                <Lock className="h-3 w-3" />
                Somente visualização
              </Badge>
            )}
            <div className="space-y-2">
              <Label>Nome da coluna</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do estágio"
                disabled={!canEdit}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Cor</Label>
              {canEdit ? (
                <ColorPicker value={color} onChange={setColor} />
              ) : (
                <div className="flex items-center gap-3 p-2 border rounded-md bg-muted/30">
                  <div 
                    className="w-6 h-6 rounded-md border border-border"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-mono text-sm text-muted-foreground">{color}</span>
                </div>
              )}
            </div>
            
            {canEdit && (
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="w-[40%] rounded-xl" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button className="w-[60%] rounded-xl" onClick={handleSaveGeneral} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </div>
            )}
          </TabsContent>
          
          {/* Cadence Tab */}
          <TabsContent value="cadence" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Cadência de tarefas</Label>
              {canEdit ? (
                <Button 
                  size="sm" 
                  onClick={() => setTaskDialogOpen(true)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Somente visualização
                </Badge>
              )}
            </div>
            
            {stageTemplate && stageTemplate.tasks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Dia</TableHead>
                    <TableHead className="w-16">Tipo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stageTemplate.tasks.map((task) => {
                    const Icon = taskTypeIcons[task.type] || Clock;
                    return (
                      <TableRow key={task.id}>
                        {editingTaskId === task.id ? (
                          <>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                value={editingTask.dayOffset}
                                onChange={(e) => setEditingTask({ ...editingTask, dayOffset: parseInt(e.target.value) || 0 })}
                                className="h-8 w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={editingTask.type}
                                onValueChange={(v) => setEditingTask({ ...editingTask, type: v as any })}
                              >
                                <SelectTrigger className="h-8 w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="call">Ligação</SelectItem>
                                  <SelectItem value="message">Mensagem</SelectItem>
                                  <SelectItem value="email">Email</SelectItem>
                                  <SelectItem value="note">Observação</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editingTask.title}
                                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                                className="h-8"
                                autoFocus
                              />
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono">{task.day_offset}</TableCell>
                            <TableCell>
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell>{task.title}</TableCell>
                          </>
                        )}
                        <TableCell>
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1">
                              {editingTaskId === task.id ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary"
                                    onClick={handleSaveTask}
                                    disabled={updateTask.isPending}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleCancelEditTask}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleStartEditTask(task)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteTask(task.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
                Nenhuma tarefa configurada
              </div>
            )}
            
            {/* Add Task Mini Dialog - only show if canEdit */}
            {canEdit && taskDialogOpen && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Dia</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newTask.dayOffset}
                      onChange={(e) => setNewTask({ ...newTask, dayOffset: parseInt(e.target.value) || 0 })}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select 
                      value={newTask.type} 
                      onValueChange={(v) => setNewTask({ ...newTask, type: v as any })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Ligação</SelectItem>
                        <SelectItem value="message">Mensagem</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="note">Observação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="Ex: Primeira ligação"
                    className="h-8"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setTaskDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleAddTask}
                    disabled={!newTask.title || createTask.isPending}
                  >
                    {createTask.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Adicionar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Automations Tab */}
          <TabsContent value="automations" className="space-y-4">
            {!canEdit ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Você não tem permissão para editar automações</p>
              </div>
            ) : automationFormOpen || editingAutomation ? (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-4">
                  {editingAutomation ? 'Editar Automação' : 'Nova Automação'}
                </h4>
                <AutomationForm
                  stageId={stage.id}
                  pipelineId={stage.pipeline_id || ''}
                  automation={editingAutomation}
                  onSuccess={() => {
                    setAutomationFormOpen(false);
                    setEditingAutomation(null);
                  }}
                  onCancel={() => {
                    setAutomationFormOpen(false);
                    setEditingAutomation(null);
                  }}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-base">Automações do Estágio</Label>
                  <Button 
                    size="sm" 
                    onClick={() => setAutomationFormOpen(true)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                <AutomationsList
                  stageId={stage.id}
                  pipelineId={stage.pipeline_id || ''}
                  onEdit={(automation) => setEditingAutomation(automation)}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
