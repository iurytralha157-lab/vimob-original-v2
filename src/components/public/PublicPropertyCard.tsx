import { MapPin, Bed, Bath, Car, Maximize, Heart } from 'lucide-react';
import { getPositionClasses, WatermarkPosition } from '@/lib/watermark-utils';

interface PublicPropertyCardProps {
  property: {
    id: string;
    titulo?: string;
    title?: string;
    imagem_principal?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    quartos?: number | null;
    banheiros?: number | null;
    vagas?: number | null;
    area_util?: number | null;
    area_total?: number | null;
    valor_venda?: number | null;
    valor_aluguel?: number | null;
    preco?: number | null;
    tipo_imovel?: string | null;
    tipo_de_negocio?: string | null;
    codigo?: string | null;
    code?: string | null;
    suites?: number | null;
    [key: string]: any;
  };
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  watermarkConfig?: {
    enabled: boolean;
    logoUrl?: string;
    position?: string;
    opacity?: number;
    size?: number;
  } | null;
}

export function PublicPropertyCard({ property, primaryColor = '#C4A052', cardColor, textColor, isFavorited = false, onToggleFavorite, watermarkConfig }: PublicPropertyCardProps) {
  const formatPrice = (value: number | null | undefined) => {
    if (!value) return null;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Support both field naming conventions (DB fields vs mapped fields)
  const title = property.titulo || property.title || '';
  const price = property.valor_venda || property.valor_aluguel || property.preco || null;
  const tipoNegocio = property.tipo_de_negocio || '';
  const isRent = tipoNegocio.toLowerCase().includes('aluguel') || (!property.valor_venda && !!property.valor_aluguel);
  const badgeLabel = isRent ? 'Aluguel' : 'Venda';
  const location = [property.bairro, property.cidade].filter(Boolean).join(', ');
  const suites = property.suites;

  return (
    <div 
      className="rounded-2xl overflow-hidden transition-all duration-500 group h-full flex flex-col border border-white/5 hover:border-white/10"
      style={{ 
        backgroundColor: cardColor || '#FFFFFF', 
        boxShadow: '0 4px 20px -10px rgba(0,0,0,0.1)'
      }}
    >
      {/* Image Section */}
      <div className="relative aspect-[4/3] overflow-hidden">
         <img
           src={property.imagem_principal || '/placeholder.svg'}
           alt={title || 'Imóvel'}
           loading="lazy"
           decoding="async"
           width={400}
           height={300}
           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
         />

        {/* Badge */}
        <div className="absolute top-3 left-3">
          <span 
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white rounded-md"
            style={{ backgroundColor: primaryColor }}
          >
            {badgeLabel}
          </span>
        </div>

        {/* Favorite */}
        <button 
          className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all group/heart"
          aria-label={isFavorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite?.(property.id);
          }}
        >
          <Heart 
            className={`w-3.5 h-3.5 transition-colors ${isFavorited ? 'text-red-500 fill-red-500' : 'text-gray-500 group-hover/heart:text-red-400'}`}
          />
        </button>

        {/* Watermark */}
        {watermarkConfig?.enabled && watermarkConfig?.logoUrl && (
          <div 
            className={`absolute pointer-events-none select-none ${getPositionClasses((watermarkConfig.position as WatermarkPosition) || 'bottom-right')}`}
            style={{ opacity: (watermarkConfig.opacity || 20) / 100 }}
          >
            <img 
              src={watermarkConfig.logoUrl} 
              alt=""
              style={{ 
                maxHeight: `${Math.max(16, (watermarkConfig.size || 80) * 0.25)}px`,
                maxWidth: `${Math.max(32, (watermarkConfig.size || 80) * 0.5)}px`
              }}
              className="object-contain drop-shadow-lg"
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-5 flex flex-col flex-1">
        {/* Code */}
        {(property.codigo || property.code) && (
          <p className="text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5 opacity-60" style={{ color: textColor || '#111827' }}>
            REF: {property.codigo || property.code}
          </p>
        )}
 
        {/* Title */}
        <h3 className="font-medium text-[15px] leading-snug mb-2 line-clamp-2 min-h-[2.5rem] tracking-tight" style={{ color: textColor || '#111827' }}>
          {title}
        </h3>

        {/* Location */}
        {location && (
          <p className="text-xs flex items-center gap-1 mb-3" style={{ color: textColor ? `${textColor}99` : '#9ca3af' }}>
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        )}

        {/* Features */}
        <div className="flex items-center gap-x-4 gap-y-2 text-xs mb-3 flex-wrap" style={{ color: textColor ? `${textColor}B3` : '#6b7280' }}>
          {suites != null && suites > 0 ? (
            <span className="flex items-center gap-1">
              <Bed className="w-3.5 h-3.5" />
              <span>{suites} suítes</span>
            </span>
          ) : property.quartos != null && property.quartos > 0 ? (
            <span className="flex items-center gap-1">
              <Bed className="w-3.5 h-3.5" />
              <span>{property.quartos}</span>
            </span>
          ) : null}
          {property.banheiros != null && property.banheiros > 0 && (
            <span className="flex items-center gap-1">
              <Bath className="w-3.5 h-3.5" />
              <span>{property.banheiros}</span>
            </span>
          )}
          {property.vagas != null && property.vagas > 0 && (
            <span className="flex items-center gap-1">
              <Car className="w-3.5 h-3.5" />
              <span>{property.vagas}</span>
            </span>
          )}
          {(property.area_util || property.area_total) && (
            <span className="flex items-center gap-1">
              <Maximize className="w-3.5 h-3.5" />
              <span>{property.area_util || property.area_total}m²</span>
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Price */}
        {price && (
          <div className="pt-3 border-t" style={{ borderColor: textColor ? `${textColor}15` : '#f3f4f6' }}>
            <p 
              className="text-lg font-bold leading-tight"
              style={{ color: primaryColor }}
            >
              {formatPrice(price)}
              {isRent && <span className="text-xs font-normal" style={{ color: textColor ? `${textColor}99` : '#9ca3af' }}>/mês</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
