import React from 'react';
import { getDisplayPropertyType } from '@/lib/property-display-utils';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Bed, Bath, Car, Maximize } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface RelatedProperty {
  id: string;
  code: string;
  title: string;
  preco: number | null;
  tipo_de_imovel: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_util: number | null;
  bairro: string | null;
  cidade: string | null;
  imagem_principal: string | null;
}

interface RelatedPropertiesProps {
  organizationId: string;
  currentPropertyCode: string;
  tipoImovel?: string | null;
  cidade?: string | null;
  getHref: (path: string) => string;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
}

export default function RelatedProperties({
  organizationId,
  currentPropertyCode,
  tipoImovel,
  cidade,
  getHref,
  primaryColor = '#F97316',
  cardColor,
  textColor,
}: RelatedPropertiesProps) {
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['related-properties', organizationId, tipoImovel, cidade, currentPropertyCode],
    queryFn: async () => {
      const params = new URLSearchParams({
        organization_id: organizationId,
        endpoint: 'related',
        property_code: currentPropertyCode,
        limit: '4',
      });

      if (tipoImovel) params.append('tipo', tipoImovel);
      if (cidade) params.append('cidade', cidade);

      const response = await fetch(
        `https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/public-site-data?${params.toString()}`
      );

      if (!response.ok) return [];
      const data = await response.json();
      return (data.properties || []) as RelatedProperty[];
    },
    enabled: !!organizationId && !!currentPropertyCode,
  });

  const formatPrice = (value: number | null) => {
    if (!value) return null;
    return value.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const titleColor = textColor || '#111827';
  const mutedColor = textColor ? `${textColor}99` : '#9ca3af';
  const featureColor = textColor ? `${textColor}B3` : '#6b7280';
  const bgColor = cardColor || '#FFFFFF';
  const borderColor = textColor ? `${textColor}15` : '#f3f4f6';

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-6" style={{ color: titleColor }}>Imóveis Semelhantes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="overflow-hidden rounded-2xl border-0" style={{ backgroundColor: bgColor }}>
              <div className="h-48 animate-pulse" style={{ backgroundColor: textColor ? `${textColor}15` : '#e5e7eb' }} />
              <CardContent className="p-4">
                <div className="h-5 rounded animate-pulse mb-2" style={{ backgroundColor: textColor ? `${textColor}15` : '#e5e7eb' }} />
                <div className="h-4 rounded animate-pulse w-2/3" style={{ backgroundColor: textColor ? `${textColor}15` : '#e5e7eb' }} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-6" style={{ color: titleColor }}>Imóveis Semelhantes</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {properties.map((property) => (
          <Link key={property.id} to={getHref(`imovel/${property.code}`)}>
            <div 
              className="overflow-hidden hover:shadow-xl transition-all duration-300 group border rounded-2xl h-full"
              style={{ backgroundColor: bgColor, borderColor }}
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={property.imagem_principal || '/placeholder.svg'}
                  alt={property.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                
                {property.tipo_de_imovel && (
                  <span className="absolute top-3 right-3 px-2.5 py-1 text-xs font-semibold bg-white/95 text-gray-800 rounded-full shadow">
                    {getDisplayPropertyType(property.tipo_de_imovel)}
                  </span>
                )}

                {property.preco && (
                  <span className="absolute bottom-3 left-3 text-lg font-bold text-white drop-shadow-lg">
                    {formatPrice(property.preco)}
                  </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-semibold mb-2 line-clamp-1" style={{ color: titleColor }}>
                  {property.title}
                </h3>
                
                {(property.bairro || property.cidade) && (
                  <p className="text-sm flex items-center gap-1 mb-3" style={{ color: mutedColor }}>
                    <MapPin className="w-3.5 h-3.5" />
                    {[property.bairro, property.cidade].filter(Boolean).join(', ')}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm" style={{ color: featureColor }}>
                  {property.suites != null && property.suites > 0 ? (
                    <span className="flex items-center gap-1">
                      <Bed className="w-4 h-4" />
                      {property.suites} suítes
                    </span>
                  ) : property.quartos != null && (
                    <span className="flex items-center gap-1">
                      <Bed className="w-4 h-4" />
                      {property.quartos}
                    </span>
                  )}
                  {property.banheiros != null && (
                    <span className="flex items-center gap-1">
                      <Bath className="w-4 h-4" />
                      {property.banheiros}
                    </span>
                  )}
                  {property.vagas != null && (
                    <span className="flex items-center gap-1">
                      <Car className="w-4 h-4" />
                      {property.vagas}
                    </span>
                  )}
                  {property.area_util && (
                    <span className="flex items-center gap-1">
                      <Maximize className="w-4 h-4" />
                      {property.area_util}m²
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
