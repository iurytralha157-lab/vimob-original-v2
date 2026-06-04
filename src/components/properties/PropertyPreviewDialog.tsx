import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Property, useProperty, useUpdateProperty } from '@/hooks/use-properties';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { cleanPropertyDescription } from '@/lib/property-description';
import useEmblaCarousel from 'embla-carousel-react';
import {
  MapPin,
  Bed,
  Bath,
  Car,
  Ruler,
  Star,
  Building2,
  Calendar,
  Sofa,
  PawPrint,
  ChevronLeft,
  ChevronRight,
  Check,
  XCircle,
  Home,
  Layers,
  Maximize2,
  Video,
  User,
  Phone,
  Mail,
} from 'lucide-react';

interface PropertyPreviewDialogProps {
  property: Property | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatPrice: (value: number | null, tipo: string | null) => string;
}

export function PropertyPreviewDialog({
  property: propertyFromList,
  open,
  onOpenChange,
  formatPrice,
}: PropertyPreviewDialogProps) {
  const isMobile = useIsMobile();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const updateProperty = useUpdateProperty();
  
  // Embla carousel com transição suave e drag
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true,
    duration: 25, // Transição mais suave
  });
  
  // Fetch full property data including gallery
  const { data: fullProperty, isLoading } = useProperty(open ? propertyFromList?.id ?? null : null);
  
  // Use full property if available, otherwise fallback to list property
  const property = fullProperty || propertyFromList;
  const showLegacyDetails = false;
  const { data: captorUser } = useQuery({
    queryKey: ['property-captor', property?.corretor_id],
    queryFn: async () => {
      if (!property?.corretor_id) return null;

      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, whatsapp')
        .eq('id', property.corretor_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: open && !!property?.corretor_id,
  });

  // Sync embla with currentIndex
  useEffect(() => {
    if (emblaApi) {
      emblaApi.on('select', () => {
        setCurrentImageIndex(emblaApi.selectedScrollSnap());
      });
    }
  }, [emblaApi]);

  // Reset and scroll to first image when property changes
  useEffect(() => {
    setCurrentImageIndex(0);
    if (emblaApi) {
      emblaApi.scrollTo(0, true);
    }
  }, [property?.id, emblaApi]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  if (!property && !isLoading) return null;

  // Combine main image and gallery
  const allImages: string[] = [];
  if (property?.imagem_principal) {
    allImages.push(property.imagem_principal);
  }
  if (property?.fotos && Array.isArray(property.fotos)) {
    const galleryImages = property.fotos as string[];
    galleryImages.forEach(img => {
      if (img && !allImages.includes(img)) {
        allImages.push(img);
      }
    });
  }

  const isActive = property?.status !== 'inativo';
  const dealType = (property?.tipo_de_negocio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const propertyType = (property?.tipo_de_imovel || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isLand = propertyType === 'terreno' || propertyType === 'lote';
  const displayPrice = dealType === 'aluguel' || dealType === 'locacao' || dealType === 'temporada'
    ? property?.valor_locacao || property?.preco || null
    : property?.preco || null;
  const displayArea = isLand ? property?.area_total : (property?.area_util || property?.area_total);
  const cleanDescription = cleanPropertyDescription(property?.descricao);
  const ownerPhone = property?.owner_cellphone || property?.owner_phone_commercial || property?.owner_phone_residential || null;
  const captorName = captorUser?.name || property?.cadastrado_por || null;
  const captorContact = captorUser?.whatsapp || captorUser?.phone || captorUser?.email || null;
  const hasOwnerInfo = !!(property?.owner_name || ownerPhone || property?.owner_email);
  const hasCaptorInfo = !!(captorName || captorContact);

  const handleToggleStatus = () => {
    if (!property) return;
    updateProperty.mutate({
      id: property.id,
      status: isActive ? 'inativo' : 'ativo',
    });
  };

  const propertyDetailsSection = property ? (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Detalhes do Imóvel
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {property.tipo_de_imovel && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Home className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Tipo:</span>
            <span className="font-medium ml-auto">{property.tipo_de_imovel}</span>
          </div>
        )}
        {property.suites !== null && property.suites !== undefined && property.suites > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Bed className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Suítes:</span>
            <span className="font-medium ml-auto">{property.suites}</span>
          </div>
        )}
        {property.andar && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Andar:</span>
            <span className="font-medium ml-auto">{property.andar}º</span>
          </div>
        )}
        {property.area_total && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Área Total:</span>
            <span className="font-medium ml-auto">{property.area_total}m²</span>
          </div>
        )}
        {property.ano_construcao && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Ano:</span>
            <span className="font-medium ml-auto">{property.ano_construcao}</span>
          </div>
        )}
        {property.mobilia && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <Sofa className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Mobília:</span>
            <span className="font-medium ml-auto">{property.mobilia}</span>
          </div>
        )}
        {property.regra_pet !== null && property.regra_pet !== undefined && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <PawPrint className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Pet:</span>
            <span className={`font-medium ml-auto flex items-center gap-1 ${property.regra_pet ? 'text-green-600' : ''}`}>
              {property.regra_pet ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {property.regra_pet ? 'Sim' : 'Não'}
            </span>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const content = isLoading ? (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-4 lg:gap-5">
      <div className="lg:w-[52%] min-h-0 lg:overflow-y-auto lg:pr-2">
        <Skeleton className={cn("w-full rounded-xl", isMobile ? "aspect-[16/10] mx-auto w-[95%]" : "aspect-video")} />
        <div className="flex gap-2 mt-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="w-16 h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="lg:w-[48%] min-h-0 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  ) : property ? (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-4 lg:gap-5">
      {/* Left Side - Image Gallery */}
      <div className="lg:w-[52%] min-h-0 flex flex-col lg:overflow-y-auto lg:pr-2">
        {/* Main Image with Embla Carousel */}
        <div className={cn(
          "relative rounded-xl overflow-hidden bg-muted group",
          isMobile ? "aspect-[16/10] mx-auto w-[95%] shadow-sm" : "aspect-video"
        )}>
          {allImages.length > 0 ? (
            <>
              {/* Embla Carousel */}
              <div 
                className="overflow-hidden h-full cursor-grab active:cursor-grabbing" 
                ref={emblaRef}
              >
                <div className="flex h-full">
                  {allImages.map((img, index) => (
                    <div key={index} className="flex-[0_0_100%] min-w-0 h-full">
                      <img
                        src={img}
                        alt={`${property.title || 'Imóvel'} - Foto ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Navigation Arrows */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={scrollPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
                    type="button"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={scrollNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
                    type="button"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Image Counter */}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                {currentImageIndex + 1} / {allImages.length}
              </div>

              {/* Main Badge */}
              {currentImageIndex === 0 && property.imagem_principal && (
                <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs">
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  Principal
                </Badge>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
              <Building2 className="h-16 w-16 mb-2 opacity-30" />
              <p className="text-sm">Sem imagens</p>
            </div>
          )}
        </div>

        {/* Thumbnail Grid */}
        {allImages.length > 1 && (
          <div className={cn("flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide", isMobile && "px-4")}>
            {allImages.slice(0, 8).map((img, index) => (
              <button
                key={index}
                type="button"
                className={cn(
                  "flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200",
                  isMobile ? "w-11 h-11" : "w-14 h-14",
                  index === currentImageIndex 
                    ? 'border-primary ring-2 ring-primary/30 scale-105' 
                    : 'border-transparent hover:border-muted-foreground/40'
                )}
                onClick={() => {
                  setCurrentImageIndex(index);
                  emblaApi?.scrollTo(index);
                }}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {allImages.length > 8 && (
              <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                +{allImages.length - 8}
              </div>
            )}
          </div>
        )}

        <div className={cn("mt-5", isMobile && "px-4")}>
          {propertyDetailsSection}
        </div>
      </div>

      {/* Right Side - Property Details */}
      <div className="lg:w-[48%] min-h-0">
        <ScrollArea className="h-auto lg:h-full pr-3">
          <div className="space-y-5">
            {/* Header with Status Toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {property.code}
                  </Badge>
                  <Badge variant={property.tipo_de_negocio === 'Venda' ? 'default' : 'secondary'}>
                    {property.tipo_de_negocio}
                  </Badge>
                  {property.destaque && (
                    <Badge className="bg-amber-500 text-white">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Destaque
                    </Badge>
                  )}
                </div>
                <h2 className="text-base lg:text-lg font-bold leading-tight">
                  {property.title || `${property.tipo_de_imovel} em ${property.bairro || 'Localização'}`}
                </h2>
              </div>
              
              {/* Status Toggle */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50 border flex-shrink-0">
                <Switch
                  checked={isActive}
                  onCheckedChange={handleToggleStatus}
                  disabled={updateProperty.isPending}
                />
                <span className={`text-xs font-medium ${isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>

            {/* Location */}
            {(property.endereco || property.bairro || property.cidade) && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  {[property.endereco, property.numero, property.bairro, property.cidade, property.uf]
                    .filter(Boolean)
                    .join(', ')}
                  {property.cep && <span className="text-xs ml-1">- CEP: {property.cep}</span>}
                </span>
              </div>
            )}

            {/* Price */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
              <p className="text-lg lg:text-xl font-bold text-primary">
                {formatPrice(displayPrice, property.tipo_de_negocio)}
              </p>
              {property.tipo_de_negocio === 'Aluguel' && (
                <p className="text-sm text-muted-foreground">por mês</p>
              )}
            </div>

            {/* Key Features */}
            <div className="grid grid-cols-4 gap-2">
              {property.quartos !== null && property.quartos !== undefined && property.quartos > 0 && (
                <div className="flex flex-col items-center p-2 rounded-xl bg-muted/50 border text-center">
                  <Bed className="h-5 w-5 text-primary mb-1" />
                  <span className="font-bold">{property.quartos}</span>
                  <span className="text-[10px] text-muted-foreground">Quartos</span>
                </div>
              )}
              {property.banheiros !== null && property.banheiros !== undefined && property.banheiros > 0 && (
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50 border text-center">
                  <Bath className="h-5 w-5 text-primary mb-1" />
                  <span className="font-bold">{property.banheiros}</span>
                  <span className="text-[10px] text-muted-foreground">Banheiros</span>
                </div>
              )}
              {property.vagas !== null && property.vagas !== undefined && property.vagas > 0 && (
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50 border text-center">
                  <Car className="h-5 w-5 text-primary mb-1" />
                  <span className="font-bold">{property.vagas}</span>
                  <span className="text-[10px] text-muted-foreground">Vagas</span>
                </div>
              )}
              {displayArea && (
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50 border text-center">
                  <Ruler className="h-5 w-5 text-primary mb-1" />
                  <span className="font-bold">{displayArea}</span>
                  <span className="text-[10px] text-muted-foreground">{isLand ? 'm² total' : 'm²'}</span>
                </div>
              )}
            </div>

            {showLegacyDetails && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Detalhes do Imóvel
              </h3>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {property.tipo_de_imovel && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium ml-auto">{property.tipo_de_imovel}</span>
                  </div>
                )}
                {property.suites !== null && property.suites !== undefined && property.suites > 0 && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Bed className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Suítes:</span>
                    <span className="font-medium ml-auto">{property.suites}</span>
                  </div>
                )}
                {property.andar && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Andar:</span>
                    <span className="font-medium ml-auto">{property.andar}º</span>
                  </div>
                )}
                {property.area_total && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Maximize2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Área Total:</span>
                    <span className="font-medium ml-auto">{property.area_total}m²</span>
                  </div>
                )}
                {property.ano_construcao && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Ano:</span>
                    <span className="font-medium ml-auto">{property.ano_construcao}</span>
                  </div>
                )}
                {property.mobilia && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <Sofa className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Mobília:</span>
                    <span className="font-medium ml-auto">{property.mobilia}</span>
                  </div>
                )}
                {property.regra_pet !== null && property.regra_pet !== undefined && (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/30">
                    <PawPrint className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Pet:</span>
                    <span className={`font-medium ml-auto flex items-center gap-1 ${property.regra_pet ? 'text-green-600' : ''}`}>
                      {property.regra_pet ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {property.regra_pet ? 'Sim' : 'Não'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Monthly Costs */}
            {(property.condominio || property.iptu || property.seguro_incendio || property.taxa_de_servico) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Custos Mensais
                </h3>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {property.condominio && (
                    <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40">
                      <span className="text-xs text-muted-foreground block">Condomínio</span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">
                        R$ {property.condominio.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {property.iptu && (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40">
                      <span className="text-xs text-muted-foreground block">IPTU</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        R$ {property.iptu.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {property.seguro_incendio && (
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                      <span className="text-xs text-muted-foreground block">Seguro Incêndio</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        R$ {property.seguro_incendio.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {property.taxa_de_servico && (
                    <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/40">
                      <span className="text-xs text-muted-foreground block">Taxa Serviço</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">
                        R$ {property.taxa_de_servico.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(hasOwnerInfo || hasCaptorInfo) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Responsáveis
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {hasOwnerInfo && (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <User className="h-4 w-4 text-primary" />
                        Proprietário
                      </div>
                      {property.owner_name && <p className="text-foreground">{property.owner_name}</p>}
                      {ownerPhone && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {ownerPhone}
                        </p>
                      )}
                      {property.owner_email && (
                        <p className="flex items-center gap-2 text-muted-foreground break-all">
                          <Mail className="h-3.5 w-3.5" />
                          {property.owner_email}
                        </p>
                      )}
                    </div>
                  )}

                  {hasCaptorInfo && (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <User className="h-4 w-4 text-primary" />
                        Captador
                      </div>
                      {captorName && <p className="text-foreground">{captorName}</p>}
                      {captorContact && (
                        <p className="flex items-center gap-2 text-muted-foreground break-all">
                          {captorContact.includes('@') ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                          {captorContact}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {cleanDescription && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Descrição
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {cleanDescription}
                </p>
              </div>
            )}

            {/* Detalhes Extras */}
            {(property as any).detalhes_extras && (property as any).detalhes_extras.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Detalhes Extras
                </h3>
                <div className="flex flex-wrap gap-2">
                  {((property as any).detalhes_extras as string[]).map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
                      <Check className="h-3 w-3 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proximidades */}
            {(property as any).proximidades && (property as any).proximidades.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Proximidades
                </h3>
                <div className="flex flex-wrap gap-2">
                  {((property as any).proximidades as string[]).map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Link */}
            {property.video_imovel && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Vídeo
                </h3>
                <a
                  href={property.video_imovel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Video className="h-4 w-4" />
                  Assistir vídeo do imóvel
                </a>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] p-4 rounded-t-[2rem]">
          <SheetHeader className="pb-4">
            <SheetTitle>Visualizar Imóvel</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(90vh-80px)]">
            {content}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Visualizar Imóvel</DialogTitle>
        </DialogHeader>
        <div className="h-[calc(80vh-73px)] min-h-0 overflow-hidden p-5">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
