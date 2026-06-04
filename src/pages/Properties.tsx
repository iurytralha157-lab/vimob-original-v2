import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  Search, 
  Loader2,
  Star,
  Building2,
  CheckCircle,
  LayoutGrid
} from 'lucide-react';
import { useInfiniteProperties, useUpdateProperty, useDeleteProperty, Property } from '@/hooks/use-properties';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertyPreviewDialog } from '@/components/properties/PropertyPreviewDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toast } from 'sonner';

const formatPrice = (value: number | null, tipo: string | null) => {
  if (!value) return 'Preço não informado';
  if (tipo === 'Aluguel') {
    return `R$ ${value.toLocaleString('pt-BR')}/mês`;
  }
  return `R$ ${value.toLocaleString('pt-BR')}`;
};

const GRID_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];

export default function Properties() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [previewProperty, setPreviewProperty] = useState<Property | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [gridCols, setGridCols] = useState('4');
  const isMobile = useIsMobile();
  const { profile, isSuperAdmin } = useAuth();
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  
  const { 
    data, 
    isLoading, 
    isFetching,
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useInfiniteProperties(debouncedSearch);

  const properties = data?.pages.flatMap(page => page.properties) || [];
  const totalCount = data?.pages[0]?.totalCount || 0;
  const updateProperty = useUpdateProperty();
  const deleteProperty = useDeleteProperty();

  const openEdit = (property: Property) => {
    navigate(`/properties/${property.id}/edit`);
  };

  const handleDelete = async (id: string) => {
    await deleteProperty.mutateAsync(id);
  };

  const handleMarkSold = async (id: string) => {
    await updateProperty.mutateAsync({ id, status: 'vendido' });
    toast.success('Imóvel marcado como vendido!');
  };

  const handleToggleVisibility = async (id: string, isPublic: boolean) => {
    await updateProperty.mutateAsync({ 
      id, 
      status: isPublic ? 'ativo' : 'privado' 
    });
    toast.success(isPublic ? 'Imóvel agora é público!' : 'Imóvel agora é privado!');
  };

  const stats = {
    total: totalCount,
    destaque: properties.filter(p => p.destaque).length,
    vendidos: properties.filter(p => p.status === 'vendido').length,
    venda: properties.filter(p => p.tipo_de_negocio === 'Venda' && p.status !== 'vendido').length,
    aluguel: properties.filter(p => p.tipo_de_negocio === 'Aluguel').length,
  };

  const getGridClasses = () => {
    if (isMobile) return 'grid-cols-1';
    switch (gridCols) {
      case '2': return 'grid-cols-1 sm:grid-cols-2';
      case '3': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case '4': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      case '5': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
      default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    }
  };

  if (isLoading && !data) {
    return (
      <AppLayout title="Imóveis">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Imóveis">
      <div className="space-y-4 sm:space-y-6 animate-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar imóveis..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {isFetching && !isFetchingNextPage && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {!isMobile && (
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <Select value={gridCols} onValueChange={setGridCols}>
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRID_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => navigate('/properties/new')} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" />
              {isMobile ? 'Novo' : 'Novo Imóvel'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                <Star className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{stats.destaque}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Destaque</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{stats.vendidos}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Vendidos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-chart-1/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-chart-1" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{stats.venda}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">À Venda</p>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-chart-2/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-chart-2" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{stats.aluguel}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Aluguel</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Empty State */}
        {properties.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-2">Nenhum imóvel cadastrado</h3>
              <p className="text-muted-foreground mb-4">
                Cadastre seu primeiro imóvel para começar
              </p>
              <Button onClick={() => navigate('/properties/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar imóvel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Properties Grid */}
        <div className={`grid ${getGridClasses()} gap-4`}>
          {properties.map((property) => {
            const canEditProperty = isAdmin || (property as any).cadastrado_por === profile?.id;
            return (
              <PropertyCard
                key={property.id}
                property={property}
                onEdit={openEdit}
                onDelete={handleDelete}
                onMarkSold={handleMarkSold}
                onToggleVisibility={handleToggleVisibility}
                onPreview={(p) => {
                  setPreviewProperty(p);
                  setPreviewOpen(true);
                }}
                formatPrice={formatPrice}
                canEdit={canEditProperty}
              />
            );
          })}
        </div>

        {/* Load More */}
        {hasNextPage && (
          <div className="flex justify-center py-8">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="min-w-[200px]"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                'Carregar mais imóveis'
              )}
            </Button>
          </div>
        )}

        {/* Preview Dialog */}
        <PropertyPreviewDialog
          property={previewProperty}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          formatPrice={formatPrice}
        />
      </div>
    </AppLayout>
  );
}
