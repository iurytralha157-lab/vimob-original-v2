import { AppLayout } from "@/components/layout/AppLayout";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { 
  useConstructionProject, 
  useCreateConstructionProject, 
  useUpdateConstructionProject 
} from "@/hooks/use-construction";
import { useProperties } from "@/hooks/use-properties";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

export default function ConstructionProjectForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const { data: project, isLoading: loadingProject } = useConstructionProject(id!);
  const { data: properties, isLoading: loadingProperties } = useProperties();
  const createProject = useCreateConstructionProject();
  const updateProject = useUpdateConstructionProject();

  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      name: "",
      description: "",
      property_id: "",
      status: "planned",
      project_type: "construction",
      budget_estimated: 0,
      start_date_planned: "",
      end_date_planned: "",
      city_hall_approval_date: ""
    }
  });


  const selectedPropertyId = watch("property_id");
  const selectedStatus = watch("status");

  useEffect(() => {
    if (project && isEditing) {
      reset({
        name: project.name || "",
        description: project.description || "",
        property_id: project.property_id || "",
        status: project.status || "planned",
        project_type: (project as any).project_type || "construction",
        budget_estimated: project.budget_estimated || 0,
        start_date_planned: project.start_date_planned ? project.start_date_planned.split('T')[0] : "",
        end_date_planned: project.end_date_planned ? project.end_date_planned.split('T')[0] : "",
        city_hall_approval_date: (project as any).city_hall_approval_date ? (project as any).city_hall_approval_date.split('T')[0] : ""
      });
    }

  }, [project, isEditing, reset]);

  const onSubmit = async (values: any) => {
    try {
      if (isEditing) {
        await updateProject.mutateAsync({ id, ...values });
      } else {
        const result: any = await createProject.mutateAsync(values);
        navigate(`/engenharia/obras/${result.id}`);
      }
      if (isEditing) navigate(`/engenharia/obras/${id}`);
    } catch (error) {
      console.error(error);
    }
  };

  if (loadingProject && isEditing) {
    return (
      <AppLayout title="Carregando...">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={isEditing ? "Editar Obra" : "Nova Obra"}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(isEditing ? `/engenharia/obras/${id}` : "/engenharia/obras")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{isEditing ? "Editar Obra" : "Cadastrar Nova Obra"}</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
              <CardDescription>Dados principais da obra operacional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Obra</Label>
                <Input 
                  id="name" 
                  placeholder="Ex: Reforma Apartamento 402 - Ed. Solar" 
                  {...register("name", { required: true })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Projeto</Label>
                  <Select 
                    value={watch("project_type")} 
                    onValueChange={(v) => setValue("project_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construction">Obra / Construção</SelectItem>
                      <SelectItem value="architecture">Arquitetura / Projeto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status Inicial</Label>
                  <Select 
                    value={selectedStatus} 
                    onValueChange={(v) => setValue("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planejada</SelectItem>
                      <SelectItem value="in_progress">Em Andamento</SelectItem>
                      <SelectItem value="paused">Pausada</SelectItem>
                      <SelectItem value="completed">Concluída</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Imóvel / Localização</Label>
                <Select 
                  value={selectedPropertyId} 
                  onValueChange={(v) => setValue("property_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um imóvel" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties?.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.title} ({prop.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city_hall_approval_date">Data de Aprovação Prefeitura (Arquitetura)</Label>
                <Input 
                  id="city_hall_approval_date" 
                  type="date" 
                  {...register("city_hall_approval_date")}
                />
              </div>


              <div className="space-y-2">
                <Label htmlFor="description">Descrição / Escopo</Label>
                <Textarea 
                  id="description" 
                  placeholder="Descreva brevemente o que será feito..." 
                  rows={4}
                  {...register("description")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prazos e Orçamento</CardTitle>
              <CardDescription>Estimativas iniciais de tempo e custo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date_planned">Data de Início Prevista</Label>
                  <Input 
                    id="start_date_planned" 
                    type="date" 
                    {...register("start_date_planned")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date_planned">Data de Término Prevista</Label>
                  <Input 
                    id="end_date_planned" 
                    type="date" 
                    {...register("end_date_planned")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget_estimated">Orçamento Estimado (R$)</Label>
                <Input 
                  id="budget_estimated" 
                  type="number" 
                  step="0.01"
                  placeholder="0,00"
                  {...register("budget_estimated")}
                />
                <p className="text-[10px] text-muted-foreground">
                  Este valor será usado para calcular o progresso financeiro conforme os gastos forem registrados.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate(isEditing ? `/engenharia/obras/${id}` : "/engenharia/obras")}
            >
              Cancelar
            </Button>
            <Button type="submit" className="gap-2" disabled={createProject.isPending || updateProject.isPending}>
              <Save className="h-4 w-4" />
              {isEditing ? "Salvar Alterações" : "Criar Obra"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}