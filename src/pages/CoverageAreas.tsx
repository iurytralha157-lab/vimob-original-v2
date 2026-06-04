import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Plus, 
  Search, 
  MapPin,
  Building,
  Map,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { CoverageFormDialog } from '@/components/coverage/CoverageFormDialog';
import { 
  useCoverageAreas, 
  useCreateCoverageArea, 
  useCreateCoverageAreasBatch,
  useUpdateCoverageArea, 
  useDeleteCoverageArea,
  type CoverageArea 
} from '@/hooks/use-coverage-areas';
import { ModuleGuard } from '@/components/guards/ModuleGuard';
import { useUserPermissions } from '@/hooks/use-user-permissions';

interface GroupedAreas {
  [uf: string]: {
    [city: string]: CoverageArea[];
  };
}

export default function CoverageAreas() {
  const { hasPermission } = useUserPermissions();
  const canEdit = hasPermission('coverage_edit');
  const { data: areas = [], isLoading } = useCoverageAreas();
  const createArea = useCreateCoverageArea();
  const createAreasBatch = useCreateCoverageAreasBatch();
  const updateArea = useUpdateCoverageArea();
  const deleteArea = useDeleteCoverageArea();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<CoverageArea | null>(null);
  const [deletingArea, setDeletingArea] = useState<CoverageArea | null>(null);

  // Agrupar por UF > Cidade
  const groupedAreas = useMemo(() => {
    const filtered = areas.filter(area =>
      area.neighborhood.toLowerCase().includes(search.toLowerCase()) ||
      area.city.toLowerCase().includes(search.toLowerCase()) ||
      area.uf.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.reduce<GroupedAreas>((acc, area) => {
      if (!acc[area.uf]) acc[area.uf] = {};
      if (!acc[area.uf][area.city]) acc[area.uf][area.city] = [];
      acc[area.uf][area.city].push(area);
      return acc;
    }, {});
  }, [areas, search]);

  // Estatísticas
  const stats = {
    total: areas.length,
    ufs: [...new Set(areas.map(a => a.uf))].length,
    cities: [...new Set(areas.map(a => `${a.uf}-${a.city}`))].length,
    active: areas.filter(a => a.is_active).length,
  };

  // Para o formulário
  const existingUFs = [...new Set(areas.map(a => a.uf))];
  const existingCities = areas.map(a => ({ uf: a.uf, city: a.city }));

  const handleEdit = (area: CoverageArea) => {
    setEditingArea(area);
    setFormOpen(true);
  };

  const handleDelete = (area: CoverageArea) => {
    setDeletingArea(area);
  };

  const confirmDelete = async () => {
    if (deletingArea) {
      await deleteArea.mutateAsync(deletingArea.id);
      setDeletingArea(null);
    }
  };

  const handleSubmit = async (data: Parameters<typeof createArea.mutateAsync>[0]) => {
    if (editingArea) {
      await updateArea.mutateAsync({ id: editingArea.id, ...data });
    } else {
      await createArea.mutateAsync(data);
    }
    setFormOpen(false);
    setEditingArea(null);
  };

  const handleSubmitBatch = async (data: Parameters<typeof createAreasBatch.mutateAsync>[0]) => {
    await createAreasBatch.mutateAsync(data);
    setFormOpen(false);
  };

  return (
    <ModuleGuard module="coverage">
      <AppLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">Áreas de Cobertura</h1>
              <p className="text-muted-foreground">
                Gerencie as localidades que sua empresa atende
              </p>
            </div>
            {canEdit && (
              <Button onClick={() => { setEditingArea(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Localidade
              </Button>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <CardDescription>Total Bairros</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Map className="h-4 w-4 text-blue-500" />
                  <CardDescription>Estados</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.ufs}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-purple-500" />
                  <CardDescription>Cidades</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.cities}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <CardDescription>Ativos</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.active}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por bairro, cidade ou UF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Areas List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(groupedAreas).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhuma localidade encontrada</h3>
                <p className="text-muted-foreground text-sm">
                  {search ? 'Tente outra busca' : 'Comece cadastrando suas áreas de cobertura'}
                </p>
                {canEdit && !search && (
                  <Button 
                    className="mt-4" 
                    onClick={() => { setEditingArea(null); setFormOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Localidade
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {Object.entries(groupedAreas).sort().map(([uf, cities]) => (
                <AccordionItem key={uf} value={uf} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-bold">
                        {uf}
                      </Badge>
                      <span className="font-medium">
                        {Object.keys(cities).length} cidade(s), {' '}
                        {Object.values(cities).flat().length} bairro(s)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-4">
                      {Object.entries(cities).sort().map(([city, neighborhoods]) => (
                        <div key={city} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{city}</span>
                            <Badge variant="secondary" className="text-xs">
                              {neighborhoods.length} bairro(s)
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 ml-6">
                            {neighborhoods.sort((a, b) => a.neighborhood.localeCompare(b.neighborhood)).map(area => (
                              <Badge 
                                key={area.id} 
                                variant={area.is_active ? 'default' : 'outline'}
                                className="gap-1 group cursor-default"
                              >
                                <MapPin className="h-3 w-3" />
                                {area.neighborhood}
                                {area.zone && (
                                  <span className="text-xs opacity-70">({area.zone})</span>
                                )}
                                {canEdit && (
                                  <span className="hidden group-hover:inline-flex gap-1 ml-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleEdit(area); }}
                                      className="hover:text-primary"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(area); }}
                                      className="hover:text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>

        {/* Form Dialog */}
        <CoverageFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingArea(null);
          }}
          area={editingArea}
          existingUFs={existingUFs}
          existingCities={existingCities}
          onSubmit={handleSubmit}
          onSubmitBatch={handleSubmitBatch}
          isLoading={createArea.isPending || createAreasBatch.isPending || updateArea.isPending}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingArea} onOpenChange={() => setDeletingArea(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover localidade?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover o bairro "{deletingArea?.neighborhood}" 
                de {deletingArea?.city}/{deletingArea?.uf}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </ModuleGuard>
  );
}
