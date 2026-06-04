import { Link, useLocation, useSearchParams } from "react-router-dom";
import { usePublicProperties, usePropertyTypes, usePublicCities, usePublicNeighborhoods } from "@/hooks/use-public-site";
import { Search, MapPin, Bed, Bath, Car, Maximize, X, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { PublicPropertyCard } from "@/components/public/PublicPropertyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePublicContext } from "./usePublicContext";
import PropertyFiltersContent from "@/components/public/PropertyFiltersContent";
import { getPositionClasses, WatermarkPosition } from "@/lib/watermark-utils";
import { usePublicFavorites } from "@/hooks/use-public-favorites";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicProperties() {
  const { organizationId, siteConfig, isLoading: isConfigLoading } = usePublicContext();
  const { isFavorite, toggleFavorite } = usePublicFavorites(organizationId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  
  // Get colors from config
  const primaryColor = siteConfig?.primary_color || '#C4A052';
  const secondaryColor = siteConfig?.secondary_color || '#0D0D0D';
  
  // Separate local state for search input to prevent focus loss - MUST be at the top
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState(() => ({
    search: searchParams.get('search') || '',
    tipo: searchParams.get('tipo') || '',
    finalidade: searchParams.get('finalidade') || '',
    cidade: searchParams.get('cidade') || '',
    bairro: searchParams.get('bairro') || '',
    quartos: searchParams.get('quartos') || '',
    suites: searchParams.get('suites') || '',
    minPrice: searchParams.get('min_price') || '',
    maxPrice: searchParams.get('max_price') || '',
    banheiros: searchParams.get('banheiros') || '',
    vagas: searchParams.get('vagas') || '',
    mobilia: searchParams.get('mobilia') || '',
    page: parseInt(searchParams.get('page') || '1'),
  }));
  
  // Track if URL changes came from external navigation (header links)
  const lastLocationSearch = useRef(location.search);
  
  // Sync state with URL when URL changes externally (e.g., clicking header links)
  useEffect(() => {
    // Only sync if URL changed externally
    if (location.search !== lastLocationSearch.current) {
      const newParams = new URLSearchParams(location.search);
      setFilters({
        search: newParams.get('search') || '',
        tipo: newParams.get('tipo') || '',
        finalidade: newParams.get('finalidade') || '',
        cidade: newParams.get('cidade') || '',
        bairro: newParams.get('bairro') || '',
        quartos: newParams.get('quartos') || '',
        suites: newParams.get('suites') || '',
        minPrice: newParams.get('min_price') || '',
        maxPrice: newParams.get('max_price') || '',
        banheiros: newParams.get('banheiros') || '',
        vagas: newParams.get('vagas') || '',
        mobilia: newParams.get('mobilia') || '',
        page: parseInt(newParams.get('page') || '1'),
      });
    }
  }, [location.search]);

  // Sync local search with debounced update to filters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        setFilters(prev => ({ ...prev, search: localSearch, page: 1 }));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch, filters.search]);
  
  // Sync local search when filters.search changes externally (e.g., from URL)
  useEffect(() => {
    if (filters.search !== localSearch && document.activeElement !== searchInputRef.current) {
      setLocalSearch(filters.search);
    }
  }, [filters.search]);

  const { data, isLoading } = usePublicProperties(organizationId, {
    page: filters.page,
    limit: 12,
    search: filters.search,
    tipo: filters.tipo,
    finalidade: filters.finalidade || undefined,
    cidade: filters.cidade,
    bairro: filters.bairro,
    quartos: filters.quartos ? parseInt(filters.quartos) : undefined,
    suites: filters.suites ? parseInt(filters.suites) : undefined,
    banheiros: filters.banheiros ? parseInt(filters.banheiros) : undefined,
    vagas: filters.vagas ? parseInt(filters.vagas) : undefined,
    minPrice: filters.minPrice ? parseFloat(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice ? parseFloat(filters.maxPrice) : undefined,
    mobilia: filters.mobilia || undefined,
  });

  const { data: propertyTypes = [] } = usePropertyTypes(organizationId);
  const { data: cities = [] } = usePublicCities(organizationId);
  const { data: neighborhoods = [] } = usePublicNeighborhoods(organizationId, filters.cidade);

  // Get base path for preview mode
  const isPreviewMode = location.pathname.includes('/site/preview') || location.pathname.includes('/site/previsualização');
  const orgParam = searchParams.get('org');
  
  const getHref = (path: string) => {
    if (isPreviewMode && orgParam) {
      if (path.includes('?')) {
        return `/site/preview/${path}&org=${orgParam}`;
      }
      return `/site/preview/${path}?org=${orgParam}`;
    }
    const siteMatch = location.pathname.match(/^\/sites\/([^/]+)/);
    if (siteMatch) {
      return `/sites/${siteMatch[1]}/${path}`;
    }
    return `/${path}`;
  };

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    // Keep org param if it exists
    const orgParam = searchParams.get('org');
    
    if (filters.search) params.set('search', filters.search);
    if (filters.tipo) params.set('tipo', filters.tipo);
    if (filters.finalidade) params.set('finalidade', filters.finalidade);
    if (filters.cidade) params.set('cidade', filters.cidade);
    if (filters.quartos) params.set('quartos', filters.quartos);
    if (filters.suites) params.set('suites', filters.suites);
    if (filters.minPrice) params.set('min_price', filters.minPrice);
    if (filters.maxPrice) params.set('max_price', filters.maxPrice);
    if (filters.banheiros) params.set('banheiros', filters.banheiros);
    if (filters.vagas) params.set('vagas', filters.vagas);
    if (filters.mobilia) params.set('mobilia', filters.mobilia);
    if (filters.page > 1) params.set('page', String(filters.page));
    
    if (orgParam) params.set('org', orgParam);
    
    // Update last location to track this as internal change
    const newSearch = '?' + params.toString();
    lastLocationSearch.current = newSearch;
    
    setSearchParams(params, { replace: true });
  }, [filters.search, filters.tipo, filters.finalidade, filters.cidade, filters.quartos, filters.suites, filters.minPrice, filters.maxPrice, filters.banheiros, filters.vagas, filters.mobilia, filters.page]);

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      tipo: '',
      finalidade: '',
      cidade: '',
      bairro: '',
      quartos: '',
      suites: '',
      minPrice: '',
      maxPrice: '',
      banheiros: '',
      vagas: '',
      mobilia: '',
      page: 1,
    });
  };

  const hasActiveFilters = filters.search || filters.tipo || filters.finalidade || filters.cidade || filters.bairro || filters.quartos || filters.suites || filters.minPrice || filters.maxPrice || filters.banheiros || filters.vagas || filters.mobilia;
  const activeFilterCount = [filters.search, filters.tipo, filters.finalidade, filters.cidade, filters.quartos, filters.suites, filters.minPrice, filters.maxPrice, filters.banheiros, filters.vagas, filters.mobilia].filter(Boolean).length;

  const formatPrice = (value: number | null) => {
    if (!value) return null;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // We remove the blocking return and use optional chaining/placeholders below
  const isSiteLoading = isConfigLoading;

  // Memoized callbacks to prevent unnecessary re-renders
  const handleSetLocalSearch = useCallback((value: string) => {
    setLocalSearch(value);
  }, []);

  const handleSetShowMoreFilters = useCallback((value: boolean) => {
    setShowMoreFilters(value);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: siteConfig?.site_theme !== 'light' ? siteConfig?.background_color : '#F9FAFB' }}>
      {/* Header */}
      <div 
        className="py-16 md:py-20 relative overflow-hidden"
        style={{
          backgroundImage: siteConfig?.page_banner_url 
            ? `url(${siteConfig?.page_banner_url})` 
            : undefined,
          backgroundColor: !siteConfig?.page_banner_url ? (secondaryColor || '#0D0D0D') : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-white pt-16 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">
            {isSiteLoading ? (
              <Skeleton className="h-12 w-64 mx-auto bg-white/10" />
            ) : (
              <>
                {filters.tipo === 'Apartamento' ? 'Apartamentos' : 
                 filters.tipo === 'Casa' ? 'Casas' : 
                 filters.finalidade === 'aluguel' ? 'Aluguel' : 
                 'Imóveis'}
                {filters.cidade && ` em ${filters.cidade}`}
                {!filters.tipo && !filters.finalidade && !filters.cidade && ' Disponíveis'}
              </>
            )}
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex gap-10">
          {/* Desktop Filters */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="rounded-2xl p-6 shadow-sm sticky top-24" style={{ backgroundColor: siteConfig?.card_color || '#FFFFFF' }}>
              <h2 className="font-bold text-lg mb-6 flex items-center gap-2" style={{ color: siteConfig?.text_color }}>
                <SlidersHorizontal className="w-5 h-5" />
                Filtros
              </h2>
              <PropertyFiltersContent
                localSearch={localSearch}
                setLocalSearch={handleSetLocalSearch}
                searchInputRef={searchInputRef}
                filters={filters}
                updateFilter={updateFilter}
                clearFilters={clearFilters}
                hasActiveFilters={!!hasActiveFilters}
                cities={cities}
                neighborhoods={neighborhoods}
                propertyTypes={propertyTypes}
                showMoreFilters={showMoreFilters}
                setShowMoreFilters={handleSetShowMoreFilters}
                textColor={siteConfig?.text_color}
                cardColor={siteConfig?.card_color}
              />
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {/* Mobile Filters */}
            <div className="lg:hidden mb-6">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full rounded-xl justify-between h-12">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4" />
                      Filtros
                    </span>
                    {activeFilterCount > 0 && (
                      <Badge 
                        className="text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[90%] rounded-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Filtrar Imóveis</DialogTitle>
                  </DialogHeader>
                  <PropertyFiltersContent
                    localSearch={localSearch}
                    setLocalSearch={handleSetLocalSearch}
                    searchInputRef={searchInputRef}
                    filters={filters}
                    updateFilter={updateFilter}
                    clearFilters={clearFilters}
                    hasActiveFilters={!!hasActiveFilters}
                    cities={cities}
                    neighborhoods={neighborhoods}
                    propertyTypes={propertyTypes}
                    showMoreFilters={showMoreFilters}
                    setShowMoreFilters={handleSetShowMoreFilters}
                    textColor={siteConfig?.text_color}
                  />
                </DialogContent>
              </Dialog>
            </div>

            {/* Active Filters Pills */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 mb-6">
                {filters.search && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    "{filters.search}"
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('search', '')} />
                  </Badge>
                )}
                {filters.tipo && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.tipo}
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('tipo', '')} />
                  </Badge>
                )}
                {filters.finalidade && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.finalidade === 'venda' ? 'Venda' : 'Aluguel'}
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('finalidade', '')} />
                  </Badge>
                )}
                {filters.cidade && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.cidade}
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('cidade', '')} />
                  </Badge>
                )}
                {filters.quartos && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.quartos}+ quartos
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('quartos', '')} />
                  </Badge>
                )}
                {filters.suites && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.suites}+ suítes
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('suites', '')} />
                  </Badge>
                )}
                {filters.banheiros && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.banheiros}+ banheiros
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('banheiros', '')} />
                  </Badge>
                )}
                {filters.vagas && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.vagas}+ vagas
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('vagas', '')} />
                  </Badge>
                )}
                {filters.mobilia && (
                  <Badge 
                    className="rounded-full px-3 py-1.5 gap-1 text-white border-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {filters.mobilia === 'mobiliado' ? 'Mobiliado' : filters.mobilia === 'semi' ? 'Semi-mobiliado' : filters.mobilia === 'sem' ? 'Sem mobília' : filters.mobilia}
                    <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => updateFilter('mobilia', '')} />
                  </Badge>
                )}
              </div>
            )}

            {/* Properties Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="overflow-hidden rounded-2xl border-0">
                    <div className="h-56 bg-gray-200 animate-pulse" />
                    <CardContent className="p-5">
                      <div className="h-6 bg-gray-200 rounded-lg animate-pulse mb-3" />
                      <div className="h-4 bg-gray-200 rounded-lg animate-pulse w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : data?.properties?.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-gray-100 mx-auto mb-6 flex items-center justify-center">
                  <Search className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-2xl font-bold text-gray-700 mb-3">
                  Nenhum imóvel encontrado
                </h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Tente ajustar os filtros para encontrar mais opções disponíveis.
                </p>
                {hasActiveFilters && (
                  <Button 
                    variant="outline" 
                    onClick={clearFilters}
                    className="rounded-full"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {data?.properties?.map((property) => (
                    <Link key={property.id} to={getHref(`imovel/${property.codigo || (property as any).code}`)} className="block h-full">
                      <PublicPropertyCard
                        property={property}
                        primaryColor={primaryColor}
                        cardColor={siteConfig?.card_color}
                        textColor={siteConfig?.text_color}
                        isFavorited={isFavorite(property.id)}
                        onToggleFavorite={toggleFavorite}
                        watermarkConfig={siteConfig?.watermark_enabled ? {
                          enabled: true,
                          logoUrl: siteConfig?.watermark_logo_url || siteConfig?.logo_url || undefined,
                          position: siteConfig?.watermark_position,
                          opacity: siteConfig?.watermark_opacity,
                          size: siteConfig?.watermark_size,
                        } : null}
                      />
                    </Link>
                  ))}
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex justify-center items-center gap-3 mt-12">
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full border-0"
                      style={{ 
                        backgroundColor: `${siteConfig?.text_color || '#FFFFFF'}15`,
                        color: siteConfig?.text_color || '#FFFFFF',
                      }}
                      disabled={filters.page <= 1}
                      onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                        let pageNum;
                        if (data.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (filters.page <= 3) {
                          pageNum = i + 1;
                        } else if (filters.page >= data.totalPages - 2) {
                          pageNum = data.totalPages - 4 + i;
                        } else {
                          pageNum = filters.page - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={filters.page === pageNum ? "default" : "ghost"}
                            size="icon"
                            className="rounded-full w-10 h-10 border-0"
                            style={filters.page === pageNum 
                              ? { backgroundColor: primaryColor, color: '#FFFFFF' } 
                              : { color: siteConfig?.text_color || '#FFFFFF' }
                            }
                            onClick={() => setFilters(prev => ({ ...prev, page: pageNum }))}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full border-0"
                      style={{ 
                        backgroundColor: `${siteConfig?.text_color || '#FFFFFF'}15`,
                        color: siteConfig?.text_color || '#FFFFFF',
                      }}
                      disabled={filters.page >= data.totalPages}
                      onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
