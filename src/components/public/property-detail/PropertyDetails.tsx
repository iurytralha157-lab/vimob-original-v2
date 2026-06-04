import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, MapPin, Info, Sparkles } from 'lucide-react';

interface PropertyDetailsProps {
  descricao?: string | null;
  detalhesExtras?: string[] | null;
  proximidades?: string[] | null;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
}

export default function PropertyDetails({
  descricao,
  detalhesExtras,
  proximidades,
  primaryColor = '#F97316',
  cardColor = '#FFFFFF',
  textColor,
}: PropertyDetailsProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Parse JSON arrays if they're strings
  const parseArray = (data: string[] | null | undefined): string[] => {
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
    return data;
  };

  const extras = parseArray(detalhesExtras);
  const nearby = parseArray(proximidades);

  const hasExtras = extras.length > 0;
  const hasNearby = nearby.length > 0;
  const hasDescription = descricao && descricao.trim().length > 0;

  if (!hasDescription && !hasExtras && !hasNearby) {
    return null;
  }

  // Determine if description should be truncated
  const shouldTruncate = descricao && descricao.length > 500;
  const displayDescription = shouldTruncate && !isDescriptionExpanded
    ? descricao.substring(0, 500) + '...'
    : descricao;

  return (
    <div className="space-y-8">
      {/* Description */}
      {hasDescription && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: textColor }}>
            <Info className="w-5 h-5" style={{ color: primaryColor }} />
            Sobre o Imóvel
          </h2>
          <div className="rounded-2xl p-6" style={{ backgroundColor: cardColor, borderColor: textColor ? `${textColor}15` : undefined, borderWidth: 1 }}>
            <p className="leading-relaxed whitespace-pre-wrap" style={{ color: textColor, opacity: 0.7 }}>
              {displayDescription}
            </p>
            {shouldTruncate && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="mt-4 text-sm font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                {isDescriptionExpanded ? 'Ver menos' : 'Ver mais'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs for Features and Nearby */}
      {(hasExtras || hasNearby) && (
        <Tabs defaultValue={hasExtras ? 'features' : 'nearby'} className="w-full">
          <style>{`
            .public-tabs [data-state="active"] {
              background-color: ${cardColor} !important;
              color: ${textColor} !important;
            }
          `}</style>
          <TabsList className="public-tabs w-full justify-start p-1 rounded-xl" style={{ backgroundColor: textColor ? `${textColor}10` : undefined }}>
            {hasExtras && (
              <TabsTrigger 
                value="features" 
                className="flex-1 rounded-lg gap-2"
                style={{ color: textColor ? `${textColor}99` : undefined }}
              >
                <Sparkles className="w-4 h-4" />
                Características
              </TabsTrigger>
            )}
            {hasNearby && (
              <TabsTrigger 
                value="nearby" 
                className="flex-1 rounded-lg gap-2"
                style={{ color: textColor ? `${textColor}99` : undefined }}
              >
                <MapPin className="w-4 h-4" />
                Proximidades
              </TabsTrigger>
            )}
          </TabsList>

          {hasExtras && (
            <TabsContent value="features" className="mt-6">
              <div className="rounded-2xl p-6" style={{ backgroundColor: cardColor, borderColor: textColor ? `${textColor}15` : undefined, borderWidth: 1 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {extras.map((item, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${primaryColor}20` }}
                      >
                        <Check className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                      </div>
                      <span className="text-sm" style={{ color: textColor, opacity: 0.8 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}

          {hasNearby && (
            <TabsContent value="nearby" className="mt-6">
              <div className="rounded-2xl p-6" style={{ backgroundColor: cardColor, borderColor: textColor ? `${textColor}15` : undefined, borderWidth: 1 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nearby.map((item, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${primaryColor}20` }}
                      >
                        <MapPin className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                      </div>
                      <span className="text-sm" style={{ color: textColor, opacity: 0.8 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
