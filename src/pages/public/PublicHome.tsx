import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePublicNeighborhoods, usePublicHomeData } from "@/hooks/use-public-site";
import { Search, Building, MapPin, ArrowRight, Bed, Bath, Car, Maximize, Heart, MessageCircle, CheckCircle2 } from "lucide-react";
import { PublicPropertyCard } from "@/components/public/PublicPropertyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { usePublicContext } from "./usePublicContext";
import { usePublicFavorites } from "@/hooks/use-public-favorites";
import { cn } from "@/lib/utils";
import { ContactFormDialog } from "@/components/public/ContactFormDialog";
import { getPositionClasses, WatermarkPosition } from "@/lib/watermark-utils";
import { usePublicSearchFilters, DEFAULT_SEARCH_FILTERS } from "@/hooks/use-public-search-filters";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicHome() {
  const { organizationId, siteConfig, isLoading: isConfigLoading } = usePublicContext();
  const { isFavorite, toggleFavorite } = usePublicFavorites(organizationId);
  const { data: homeData, isLoading: isHomeDataLoading } = usePublicHomeData(organizationId);
  const featuredProperties = homeData?.featured || [];
  const exclusiveProperties = homeData?.exclusive || [];
  const allProperties = homeData?.latest || [];
  const propertyTypes = homeData?.types || [];
  const cities = homeData?.cities || [];
  
  const { data: configuredFilters } = usePublicSearchFilters(organizationId);
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedFinalidade, setSelectedFinalidade] = useState("");
  const [selectedCidade, setSelectedCidade] = useState("");
  const [selectedBairro, setSelectedBairro] = useState("");
  const [selectedQuartos, setSelectedQuartos] = useState("");
  const [selectedSuites, setSelectedSuites] = useState("");
  const [selectedBanheiros, setSelectedBanheiros] = useState("");
  const [selectedVagas, setSelectedVagas] = useState("");
  const [selectedMobilia, setSelectedMobilia] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [hoveredCategory, setHoveredCategory] = useState<number | null>(null);

  const { data: neighborhoods = [] } = usePublicNeighborhoods(organizationId, selectedCidade || undefined);

  // Use configured filters or defaults
  const activeFilters = configuredFilters && configuredFilters.length > 0
    ? configuredFilters
    : DEFAULT_SEARCH_FILTERS;

  // Get colors from config with fallbacks
  const primaryColor = siteConfig?.primary_color || '#C4A052';
  const secondaryColor = siteConfig?.secondary_color || '#0D0D0D';
  const accentColor = siteConfig?.accent_color || '#3B82F6';
  const backgroundColor = siteConfig?.background_color || '#0D0D0D';
  const textColor = siteConfig?.text_color || '#FFFFFF';
  const isDarkTheme = siteConfig?.site_theme !== 'light';
  // Alternate section background
  const altBg = isDarkTheme ? 'rgba(255,255,255,0.03)' : '#F9FAFB';
  const sectionTextColor = isDarkTheme ? textColor : '#111827';
  const sectionSubTextColor = isDarkTheme ? `${textColor}99` : '#6B7280';

  const isPreviewMode = location.pathname.includes('/site/preview') || location.pathname.includes('/site/previsualização');
  const orgParam = new URLSearchParams(location.search).get('org');

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (selectedType && selectedType !== "all") params.set("tipo", selectedType);
    if (selectedFinalidade && selectedFinalidade !== "all") params.set("finalidade", selectedFinalidade);
    if (selectedCidade && selectedCidade !== "all") params.set("cidade", selectedCidade);
    if (selectedBairro && selectedBairro !== "all") params.set("bairro", selectedBairro);
    if (selectedQuartos && selectedQuartos !== "any") params.set("quartos", selectedQuartos);
    if (selectedSuites && selectedSuites !== "any") params.set("suites", selectedSuites);
    if (selectedBanheiros && selectedBanheiros !== "any") params.set("banheiros", selectedBanheiros);
    if (selectedVagas && selectedVagas !== "any") params.set("vagas", selectedVagas);
    if (selectedMobilia && selectedMobilia !== "all") params.set("mobilia", selectedMobilia);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    
    const queryString = params.toString();
    const basePath = getHref(queryString ? `imoveis?${queryString}` : 'imoveis');
    navigate(basePath);
  };

  const formatPrice = (value: number | null) => {
    if (!value) return null;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  // Categories for accordion effect
  const categories = [
    { name: 'CASAS', type: 'Casa', image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop' },
    { name: 'APARTAMENTOS', type: 'Apartamento', image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop' },
    { name: 'COBERTURAS', type: 'Cobertura', image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop' },
    { name: 'STUDIOS', type: 'Studio', image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop' },
  ];

  const isConfigLoadingState = isConfigLoading && !siteConfig;
  const showSkeletons = (isHomeDataLoading && !homeData) || isConfigLoadingState;

  // We no longer block the entire page with a spinner. 
  // The layout will render and show skeletons where needed.

  return (
    <div style={{ backgroundColor }}>
      {/* Hero Section - Fullscreen */}
      <section className="relative h-screen">
        {/* Background Image - LCP element */}
        <div className="absolute inset-0">
          {siteConfig?.hero_image_url ? (
               <img
                src={siteConfig?.hero_image_url}
                alt=""
                fetchPriority="high"
                decoding="sync"
                width={1920}
                height={1080}
                loading="eager"
                className="absolute inset-0 w-full h-full object-cover"
              />
          ) : isConfigLoadingState ? (
            <div className="absolute inset-0 w-full h-full bg-neutral-900 animate-pulse" />
          ) : (
            <div 
              className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #0D0D0D 100%)' }}
            />
          )}
          <div className="absolute inset-0 bg-black/50" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-4 pt-20 max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-5xl lg:text-7xl font-light mb-6 md:mb-10 max-w-5xl leading-[1.1] tracking-tight">
            {isConfigLoadingState ? (
              <Skeleton className="h-10 md:h-12 w-3/4 mx-auto bg-white/10" />
            ) : (
              siteConfig?.hero_title || 'Encontre o imóvel dos seus sonhos com exclusividade'
            )}
          </h1>
          {(siteConfig?.hero_subtitle || isConfigLoadingState) && (
            <p className="text-sm md:text-lg text-white/70 mb-8 md:mb-20 max-w-2xl w-full">
              {isConfigLoadingState ? (
                <Skeleton className="h-5 md:h-6 w-1/2 mx-auto bg-white/10" />
              ) : (
                siteConfig?.hero_subtitle
              )}
            </p>
          )}

          {/* Search Bar - Dynamic filters */}
          <form 
            onSubmit={handleSearch} 
            className="bg-black/40 backdrop-blur-3xl rounded-3xl p-4 md:p-6 flex flex-col md:flex-row flex-wrap gap-4 max-w-6xl w-full mx-4 mb-20 md:mb-0 border border-white/10 shadow-2xl"
          >
            {activeFilters.map((filter) => {
              const key = filter.filter_key;
              
              if (key === 'search') {
                return (
                  <div key={key} className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Digite código, condomínio, região, bairro ou cidade"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-xl"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>
                );
              }

              if (key === 'tipo') {
                return (
                  <Select key={key} value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-full md:w-48 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Tipo de Imóvel"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {propertyTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'finalidade') {
                return (
                  <Select key={key} value={selectedFinalidade} onValueChange={setSelectedFinalidade}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Finalidade"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="venda">Venda</SelectItem>
                      <SelectItem value="aluguel">Aluguel</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'cidade') {
                return (
                  <Select key={key} value={selectedCidade} onValueChange={(v) => { setSelectedCidade(v); setSelectedBairro(""); }}>
                    <SelectTrigger className="w-full md:w-48 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Cidade"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as cidades</SelectItem>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'bairro') {
                return (
                  <Select key={key} value={selectedBairro} onValueChange={setSelectedBairro}>
                    <SelectTrigger className="w-full md:w-48 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Bairro"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os bairros</SelectItem>
                      {neighborhoods.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'quartos') {
                return (
                  <Select key={key} value={selectedQuartos} onValueChange={setSelectedQuartos}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Quartos"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ quarto</SelectItem>
                      <SelectItem value="2">2+ quartos</SelectItem>
                      <SelectItem value="3">3+ quartos</SelectItem>
                      <SelectItem value="4">4+ quartos</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'suites') {
                return (
                  <Select key={key} value={selectedSuites} onValueChange={setSelectedSuites}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Suítes"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ suíte</SelectItem>
                      <SelectItem value="2">2+ suítes</SelectItem>
                      <SelectItem value="3">3+ suítes</SelectItem>
                      <SelectItem value="4">4+ suítes</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'banheiros') {
                return (
                  <Select key={key} value={selectedBanheiros} onValueChange={setSelectedBanheiros}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Banheiros"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ banheiro</SelectItem>
                      <SelectItem value="2">2+ banheiros</SelectItem>
                      <SelectItem value="3">3+ banheiros</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'vagas') {
                return (
                  <Select key={key} value={selectedVagas} onValueChange={setSelectedVagas}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Vagas"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="1">1+ vaga</SelectItem>
                      <SelectItem value="2">2+ vagas</SelectItem>
                      <SelectItem value="3">3+ vagas</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'mobilia') {
                return (
                  <Select key={key} value={selectedMobilia} onValueChange={setSelectedMobilia}>
                    <SelectTrigger className="w-full md:w-40 h-12 bg-white/10 border-white/20 text-white rounded-xl">
                      <SelectValue placeholder={filter.label || "Mobília"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualquer</SelectItem>
                      <SelectItem value="mobiliado">Mobiliado</SelectItem>
                      <SelectItem value="semi">Semi-mobiliado</SelectItem>
                      <SelectItem value="sem">Sem mobília</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }

              if (key === 'preco') {
                return (
                  <div key={key} className="flex gap-2 w-full md:w-auto">
                    <Input
                      type="number"
                      placeholder="Preço mín."
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className="h-12 w-full md:w-32 bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-xl"
                    />
                    <Input
                      type="number"
                      placeholder="Preço máx."
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="h-12 w-full md:w-32 bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-xl"
                    />
                  </div>
                );
              }

              return null;
            })}
            <Button 
              type="submit" 
              className="h-12 px-8 text-white font-medium rounded-xl"
              style={{ backgroundColor: primaryColor }}
            >
              <Search className="w-5 h-5 mr-2" />
              Buscar Imóveis
            </Button>
          </form>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center pt-2">
            <div className="w-1 h-3 bg-white/50 rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* Exclusive Properties Section */}
      {(exclusiveProperties.length > 0 || showSkeletons) && (
        <section className="py-20" style={{ backgroundColor: altBg }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span 
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: accentColor }}
              >
                Exclusivos
              </span>
              <h2 className="text-3xl md:text-4xl font-light mt-2" style={{ color: sectionTextColor }}>
                Descubra Imóveis que Definem o Conceito de Luxo
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {showSkeletons ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[400px] w-full bg-neutral-800/20 rounded-2xl animate-pulse" />
                  ))}
                </>
              ) : exclusiveProperties.map((property) => (
                <Link key={property.id} to={getHref(`imovel/${property.codigo || (property as any).code}`)} className="block h-full">
                  <PublicPropertyCard
                    property={property}
                    primaryColor={primaryColor}
                    cardColor={siteConfig?.card_color}
                    textColor={textColor}
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

            <div className="text-center mt-12">
              <Link to={getHref("imoveis")}>
                <Button 
                  variant="outline" 
                  className="border-2 px-8 py-6 text-sm tracking-wider rounded-full"
                  style={{ 
                    borderColor: primaryColor, 
                    color: primaryColor,
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = primaryColor;
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = primaryColor;
                  }}
                >
                  VER TODOS OS IMÓVEIS
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Featured Properties Section */}
      {(featuredProperties.length > 0 || showSkeletons) && (
        <section className="py-20" style={{ backgroundColor: isDarkTheme ? backgroundColor : '#FFFFFF' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span 
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: accentColor }}
              >
                Destaques
              </span>
              <h2 className="text-3xl md:text-4xl font-light mt-2" style={{ color: sectionTextColor }}>
                Imóveis em Destaque
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {showSkeletons ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[400px] w-full bg-neutral-800/20 rounded-2xl animate-pulse" />
                  ))}
                </>
              ) : featuredProperties.map((property) => (
                <Link key={property.id} to={getHref(`imovel/${property.codigo || (property as any).code}`)} className="block h-full">
                  <PublicPropertyCard
                    property={property}
                    primaryColor={primaryColor}
                    cardColor={siteConfig?.card_color}
                    textColor={textColor}
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

            <div className="text-center mt-12">
              <Link to={getHref("imoveis")}>
                <Button 
                  variant="outline" 
                  className="border-2 px-8 py-6 text-sm tracking-wider rounded-full"
                  style={{ 
                    borderColor: primaryColor, 
                    color: primaryColor,
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = primaryColor;
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = primaryColor;
                  }}
                >
                  VER TODOS OS IMÓVEIS
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* All Properties Section */}
      {(allProperties.length > 0 || showSkeletons) && (
        <section className="py-20" style={{ backgroundColor: isDarkTheme ? backgroundColor : '#FFFFFF' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-6 md:mb-12">
              <span 
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: accentColor }}
              >
                Nosso Portfólio
              </span>
              <h2 className="text-3xl md:text-4xl font-light mt-2" style={{ color: sectionTextColor }}>
                Todos os Imóveis Disponíveis
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {showSkeletons ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[400px] w-full bg-neutral-800/20 rounded-2xl animate-pulse" />
                  ))}
                </>
              ) : allProperties.map((property) => (
                <Link key={property.id} to={getHref(`imovel/${property.codigo || (property as any).code}`)} className="block h-full">
                  <PublicPropertyCard
                    property={property}
                    primaryColor={primaryColor}
                    cardColor={siteConfig?.card_color}
                    textColor={textColor}
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

            <div className="text-center mt-12">
              <Link to={getHref("imoveis")}>
                <Button 
                  variant="outline" 
                  className="border-2 px-8 py-6 text-sm tracking-wider rounded-full"
                  style={{ 
                    borderColor: primaryColor, 
                    color: primaryColor,
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = primaryColor;
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = primaryColor;
                  }}
                >
                  VER TODOS OS IMÓVEIS
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* About Section on Home */}
      {siteConfig?.show_about_on_home && (
        <section className="py-20" style={{ backgroundColor: altBg }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Image */}
              <div>
                {siteConfig?.about_image_url ? (
                  <img 
                     src={siteConfig?.about_image_url} 
                     alt={`Sobre ${siteConfig?.organization_name || 'nós'}`}
                     loading="lazy"
                     decoding="async"
                     width={600}
                     height={500}
                     className="rounded-3xl shadow-2xl w-full h-auto"
                   />
                ) : (
                  <div 
                    className="rounded-3xl h-[400px] md:h-[500px] flex items-center justify-center relative overflow-hidden"
                    style={{ backgroundColor: `${primaryColor}10` }}
                  >
                    <div 
                      className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: `linear-gradient(135deg, ${primaryColor} 0%, transparent 50%)` }}
                    />
                    <Building className="w-32 h-32" style={{ color: primaryColor }} />
                  </div>
                )}
              </div>

              {/* Text */}
              <div>
                <span 
                  className="text-sm font-semibold uppercase tracking-wider"
                  style={{ color: primaryColor }}
                >
                  Nossa História
                </span>
                <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6" style={{ color: sectionTextColor }}>
                  {siteConfig?.about_subtitle || siteConfig?.about_title || 'Transformando sonhos em realidade desde o início'}
                </h2>
                {siteConfig?.about_text ? (
                  <div className="whitespace-pre-wrap leading-relaxed text-lg" style={{ color: sectionSubTextColor }}>
                    {siteConfig?.about_text}
                  </div>
                ) : (
                  <div className="space-y-4 text-lg leading-relaxed" style={{ color: sectionSubTextColor }}>
                    <p>
                      A {siteConfig?.organization_name} nasceu com o objetivo de transformar a experiência 
                      de comprar, vender ou alugar imóveis. Nossa equipe é formada por profissionais 
                      experientes e apaixonados pelo mercado imobiliário.
                    </p>
                  </div>
                )}

                <div className="mt-8 space-y-3">
                  {(siteConfig?.about_checkmarks?.length ? siteConfig.about_checkmarks : ["Atendimento personalizado", "Imóveis verificados", "Suporte completo"]).map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: primaryColor }} />
                      <span className="font-medium" style={{ color: isDarkTheme ? `${textColor}CC` : '#374151' }}>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <Link to={getHref("sobre")}>
                    <Button 
                      className="px-8 py-6 text-sm tracking-wider rounded-full text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Saiba Mais
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Category Accordion Section */}
      <section className="py-0" style={{ backgroundColor }}>
        {/* Mobile: Grid 2x2, Desktop: Flex accordion */}
        <div className="grid grid-cols-2 md:flex md:h-[500px] overflow-hidden">
          {categories.map((cat, idx) => (
            <Link
              key={cat.name}
              to={getHref(`imoveis?tipo=${encodeURIComponent(cat.type)}`)}
              onMouseEnter={() => setHoveredCategory(idx)}
              onMouseLeave={() => setHoveredCategory(null)}
              className={cn(
                "relative h-[180px] md:h-full overflow-hidden transition-all duration-500 ease-out cursor-pointer",
                // Desktop: accordion behavior
                "md:flex-1",
                hoveredCategory !== null && hoveredCategory === idx && "md:flex-[2]",
                hoveredCategory !== null && hoveredCategory !== idx && "md:flex-[0.6]"
              )}
            >
               <img
                 src={cat.image}
                 alt={cat.name}
                 loading="lazy"
                 decoding="async"
                 width={400}
                 height={500}
                 className="absolute inset-0 w-full h-full object-cover transition-transform duration-500"
                style={{ transform: hoveredCategory === idx ? 'scale(1.1)' : 'scale(1)' }}
              />
              <div className="absolute inset-0 bg-black/40 md:hover:bg-black/30 transition-colors" />
              {/* Mobile: label at bottom center, Desktop: left center */}
              <div className="absolute inset-x-0 bottom-4 flex justify-center md:inset-x-auto md:bottom-auto md:left-0 md:top-1/2 md:-translate-y-1/2 md:block">
                <span className="bg-white text-gray-900 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold tracking-wide">
                  {cat.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section 
        className="py-24 relative"
        style={{ backgroundColor: secondaryColor }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-light mb-6">
            Não encontrou o que procura?
          </h2>
          <p className="text-white/60 text-lg mb-10 max-w-2xl mx-auto">
            Entre em contato conosco e nossa equipe especializada vai ajudar você a encontrar o imóvel ideal.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={getHref("contato")}>
              <Button 
                size="lg" 
                className="text-white px-8 py-6 text-base tracking-wide rounded-full"
                style={{ backgroundColor: primaryColor }}
              >
                Fale Conosco
              </Button>
            </Link>
            {siteConfig?.whatsapp && organizationId && (
              <ContactFormDialog
                organizationId={organizationId}
                whatsappNumber={siteConfig?.whatsapp}
                primaryColor={primaryColor}
                trigger={
                  <Button 
                    size="lg"
                    variant="outline"
                    className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white px-8 py-6 text-base tracking-wide rounded-full gap-2"
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
