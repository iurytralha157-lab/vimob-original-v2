import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useNavigate } from "react-router-dom";
import { useConstructionProject, useConstructionDiaries, useCreateConstructionDiary } from "@/hooks/use-construction";
import { 
  Loader2, 
  ArrowLeft, 
  Plus, 
  Calendar as CalendarIcon, 
  CloudSun, 
  Users as UsersIcon, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  FileText,
  MapPin,
  MoreVertical,
  Edit,
  Trash2,
  DollarSign,
  ShoppingCart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/engineering/EngineeringBadges";
import { ConstructionProgress } from "@/components/engineering/ConstructionProgress";
import { MilestoneMaterialsManager } from "@/components/engineering/MilestoneMaterialsManager";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

export default function ConstructionProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: loadingProject } = useConstructionProject(id!);
  const { data: diaries, isLoading: loadingDiaries } = useConstructionDiaries(id!);
  const createDiary = useCreateConstructionDiary();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newDiary, setNewDiary] = useState({
    entry_date: format(new Date(), "yyyy-MM-dd"),
    weather_condition: "clear",
    activities_summary: "",
    observations: "",
    manpower_count: 0
  });

  if (loadingProject) {
    return (
      <AppLayout title="Carregando...">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout title="Erro">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Obra não encontrada.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/engenharia/obras")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  const handleCreateDiary = async () => {
    if (!newDiary.activities_summary) {
      toast.error("Descreva as atividades realizadas.");
      return;
    }

    await createDiary.mutateAsync({
      project_id: id,
      ...newDiary
    });
    
    setIsDialogOpen(false);
    setNewDiary({
      entry_date: format(new Date(), "yyyy-MM-dd"),
      weather_condition: "clear",
      activities_summary: "",
      observations: "",
      manpower_count: 0
    });
  };

  const getWeatherLabel = (condition: string) => {
    const types: Record<string, string> = {
      clear: "Limpo",
      rainy: "Chuvoso",
      cloudy: "Nublado",
      stormy: "Tempestade"
    };
    return types[condition] || condition;
  };

  return (
    <AppLayout title={project.name}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/engenharia/obras")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <ProjectStatusBadge status={project.status as any} />
            </div>
            <p className="text-muted-foreground text-sm flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {project.property?.title || "Sem localização vinculada"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/engenharia/obras/${id}/editar`)}>
                <Edit className="h-4 w-4 mr-2" /> Editar Obra
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Excluir Obra
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="diaries">
              <TabsList>
                <TabsTrigger value="diaries" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Diários de Obra
                </TabsTrigger>
                <TabsTrigger value="milestones" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Marcos e Cronograma
                </TabsTrigger>
                <TabsTrigger value="finance" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  Financeiro
                </TabsTrigger>
                <TabsTrigger value="purchases" className="gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Suprimentos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="diaries" className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Registros Recentes</h3>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Registro
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Registrar Diário de Obra</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Data</Label>
                            <Input 
                              type="date" 
                              value={newDiary.entry_date} 
                              onChange={(e) => setNewDiary({...newDiary, entry_date: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Clima</Label>
                            <Select 
                              value={newDiary.weather_condition} 
                              onValueChange={(v) => setNewDiary({...newDiary, weather_condition: v})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="clear">Limpo / Ensolarado</SelectItem>
                                <SelectItem value="cloudy">Nublado</SelectItem>
                                <SelectItem value="rainy">Chuvoso</SelectItem>
                                <SelectItem value="stormy">Tempestade</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Mão de Obra (Nº de pessoas)</Label>
                          <Input 
                            type="number" 
                            value={newDiary.manpower_count} 
                            onChange={(e) => setNewDiary({...newDiary, manpower_count: parseInt(e.target.value) || 0})}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Atividades Realizadas</Label>
                          <Textarea 
                            placeholder="Descreva o que foi feito hoje..."
                            value={newDiary.activities_summary}
                            onChange={(e) => setNewDiary({...newDiary, activities_summary: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Observações / Impedimentos</Label>
                          <Textarea 
                            placeholder="Houve algum atraso ou observação importante?"
                            value={newDiary.observations}
                            onChange={(e) => setNewDiary({...newDiary, observations: e.target.value})}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateDiary} disabled={createDiary.isPending}>
                          {createDiary.isPending ? "Salvando..." : "Salvar Registro"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {loadingDiaries ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : diaries?.length === 0 ? (
                  <Card className="border-dashed py-8 text-center">
                    <p className="text-muted-foreground text-sm">Nenhum diário registrado para esta obra.</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {diaries?.map((diary: any) => (
                      <Card key={diary.id}>
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {format(new Date(diary.entry_date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                            </span>
                          </div>
                          <Badge variant="outline" className="gap-1 font-normal">
                            <CloudSun className="h-3 w-3" />
                            {getWeatherLabel(diary.weather_condition)}
                          </Badge>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                          <div className="text-sm">
                            <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-1">Atividades</h4>
                            <p className="text-card-foreground leading-relaxed">{diary.activities_summary}</p>
                          </div>
                          {diary.observations && (
                            <div className="text-sm bg-muted/50 p-2 rounded-lg border-l-2 border-amber-500">
                              <h4 className="font-semibold text-xs uppercase text-amber-600 mb-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> Observações
                              </h4>
                              <p className="text-muted-foreground italic">{diary.observations}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 pt-2 border-t text-[10px] text-muted-foreground font-medium uppercase">
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" /> {diary.manpower_count} pessoas
                            </span>
                            <span className="flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" /> 0 fotos
                            </span>
                            <span className="ml-auto">
                              Por: {diary.created_by_profile?.name || "Sistema"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="milestones" className="mt-6">
                <MilestoneMaterialsManager projectId={id!} />
              </TabsContent>

              <TabsContent value="finance" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Lançamentos Financeiros</CardTitle>
                    <CardDescription>Entradas e saídas vinculadas a esta obra</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground italic text-center py-8">
                      Funcionalidade de extrato financeiro por obra em processamento.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="purchases" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Ordens de Compra</CardTitle>
                    <CardDescription>Suprimentos solicitados para esta obra</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground italic text-center py-8">
                      Carregando histórico de suprimentos...
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Progresso Geral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConstructionProgress value={project.physical_progress_percent} label="Físico" />
                <ConstructionProgress value={project.financial_progress_percent} label="Financeiro" variant="financial" />
                <div className="pt-2 grid grid-cols-2 gap-4 border-t">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Início</p>
                    <p className="text-sm font-medium">
                      {project.start_date_planned ? format(new Date(project.start_date_planned), "dd/MM/yyyy") : "--/--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Previsão Fim</p>
                    <p className="text-sm font-medium text-amber-600">
                      {project.end_date_planned ? format(new Date(project.end_date_planned), "dd/MM/yyyy") : "--/--"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Orçamento:</span>
                  <span className="font-semibold">R$ {(project as any).budget_total?.toLocaleString("pt-BR") || "0,00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gasto Real:</span>
                  <span className="font-semibold text-red-500">R$ 0,00</span>
                </div>
                <div className="pt-2 border-t">
                  <Button variant="outline" className="w-full text-xs" size="sm">
                    Ver Todos os Custos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
