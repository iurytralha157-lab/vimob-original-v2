import { Link, useLocation } from "react-router-dom";
import { usePublicFavorites } from "@/hooks/use-public-favorites";
import { usePublicContext } from "./usePublicContext";
import { PublicPropertyCard } from "@/components/public/PublicPropertyCard";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function PublicFavorites() {
  const { organizationId, siteConfig } = usePublicContext();
  const { favorites, count, toggleFavorite, isFavorite } = usePublicFavorites(organizationId);
  const location = useLocation();
  const primaryColor = siteConfig?.primary_color || '#C4A052';
  const secondaryColor = siteConfig?.secondary_color || '#0D0D0D';

  const isPreviewMode = location.pathname.includes('/site/preview');
  const orgParam = new URLSearchParams(location.search).get('org');

  const getHref = (path: string) => {
    if (isPreviewMode && orgParam) {
      if (path.includes('?')) return `/site/preview/${path}&org=${orgParam}`;
      return `/site/preview/${path}?org=${orgParam}`;
    }
    const siteMatch = location.pathname.match(/^\/sites\/([^/]+)/);
    if (siteMatch) {
      return `/sites/${siteMatch[1]}/${path}`;
    }
    return `/${path}`;
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iemalzlfnbouobyjwlwi.supabase.co';

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['public-favorites', organizationId, favorites],
    queryFn: async () => {
      if (!organizationId || favorites.length === 0) return [];
      const params = new URLSearchParams({
        organization_id: organizationId,
        endpoint: 'favorites',
        ids: favorites.join(','),
      });
      const response = await fetch(`${supabaseUrl}/functions/v1/public-site-data?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch favorites');
      const data = await response.json();
      return data.properties || [];
    },
    enabled: !!organizationId && favorites.length > 0,
  });

  if (!siteConfig) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: siteConfig?.site_theme !== 'light' ? siteConfig?.background_color : '#F9FAFB' }}>
      {/* Header */}
      <div
        className="py-16 md:py-20 relative overflow-hidden"
        style={{
          backgroundImage: siteConfig?.page_banner_url
            ? `url(${siteConfig?.page_banner_url})`
            : undefined,
          backgroundColor: !siteConfig?.page_banner_url ? secondaryColor : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-white pt-16 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">
            Meus Favoritos
          </h1>
          {!isLoading && properties.length > 0 && (
            <p className="text-white/60 mt-3">{properties.length} {properties.length === 1 ? 'imóvel salvo' : 'imóveis salvos'}</p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="overflow-hidden rounded-2xl border-0">
                <div className="h-56 bg-gray-200 animate-pulse" />
                <CardContent className="p-5">
                  <div className="h-6 bg-gray-200 rounded-lg animate-pulse mb-3" />
                  <div className="h-4 bg-gray-200 rounded-lg animate-pulse w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-gray-100 mx-auto mb-6 flex items-center justify-center">
              <Heart className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-2xl font-bold text-gray-700 mb-3">
              Nenhum imóvel favorito
            </h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Explore nossos imóveis e salve os que mais gostar clicando no ícone de coração.
            </p>
            <Link
              to={getHref("imoveis")}
              className="inline-block px-6 py-3 rounded-full text-white text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              Ver Imóveis
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {properties.map((property: any) => (
              <Link key={property.id} to={getHref(`imovel/${property.codigo || property.code}`)} className="block h-full">
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
        )}
      </div>
    </div>
  );
}
