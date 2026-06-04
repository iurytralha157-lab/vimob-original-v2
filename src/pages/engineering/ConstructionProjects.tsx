import { AppLayout } from "@/components/layout/AppLayout";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Building2, LayoutGrid, List, Search, Filter, Loader2, Calendar, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useConstructionProjects } from "@/hooks/use-construction";
import { Input } from "@/components/ui/input";
import { ConstructionProgress } from "@/components/engineering/ConstructionProgress";
import { ProjectStatusBadge } from "@/components/engineering/EngineeringBadges";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ConstructionProjects() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  const { data: projects, isLoading } = useConstructionProjects();

  const filteredProjects = projects?.filter((p: any) => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout title="Gestão de Obras">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar obras..." 
              className="pl-9 bg-card" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-muted p-1 rounded-lg">
              <Button 
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10">
              <Filter className="h-4 w-4" />
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/90"
              onClick={() => navigate('/engenharia/obras/nova')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Obra
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProjects?.length === 0 ? (
          <Card className="border-dashed flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Nenhuma obra encontrada</CardTitle>
            <CardDescription className="mt-1">Comece criando sua primeira obra operacional.</CardDescription>
            <Button className="mt-4" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Criar Obra
            </Button>
          </Card>
        ) : (
          <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
            {filteredProjects?.map((project: any) => (
              <div key={project.id} onClick={() => navigate(`/engenharia/obras/${project.id}`)}>
                <ProjectCard project={project} viewMode={viewMode} />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ProjectCard({ project, viewMode }: { project: any, viewMode: 'grid' | 'list' }) {
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{project.name}</h3>
              <ProjectStatusBadge status={project.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {project.end_date_planned ? format(new Date(project.end_date_planned), 'dd MMM yyyy', { locale: ptBR }) : 'Sem prazo'}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Math.round(project.physical_progress_percent)}% físico
              </span>
            </div>
          </div>
          <div className="w-48 hidden md:block">
            <ConstructionProgress value={project.physical_progress_percent} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group">
      <div className="h-32 bg-muted relative overflow-hidden">
        {(project as any).property?.main_image_url ? (
          <img 
            src={(project as any).property.main_image_url} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            alt={project.name}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <Building2 className="h-12 w-12 text-primary/30" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <ProjectStatusBadge status={project.status} className="bg-background/90 backdrop-blur-sm" />
        </div>
      </div>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-lg truncate">{project.name}</CardTitle>
        <CardDescription className="truncate text-xs">
          {project.property?.title || 'Sem imóvel vinculado'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        <ConstructionProgress 
          value={project.physical_progress_percent} 
          label="Progresso Físico" 
        />
        <ConstructionProgress 
          value={project.financial_progress_percent} 
          label="Evolução Financeira" 
          variant="financial"
        />
        
        <div className="pt-2 flex items-center justify-between text-[10px] text-muted-foreground uppercase font-medium">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Fim: {project.end_date_planned ? format(new Date(project.end_date_planned), 'dd/MM/yy') : '--/--'}
          </div>
          <div>
            Gargalos: 0
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
