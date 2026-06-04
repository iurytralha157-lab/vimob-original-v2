import React from 'react';
import { 
  Bed, 
  Bath, 
  Car, 
  Maximize, 
  Building2, 
  Sofa,
  PawPrint,
  Calendar,
  Layers
} from 'lucide-react';

interface PropertyFeaturesProps {
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  areaUtil?: number | null;
  areaTotal?: number | null;
  andar?: number | null;
  anoConstrucao?: number | null;
  mobilia?: string | null;
  regraPet?: boolean | null;
  primaryColor?: string;
  textColor?: string;
}

export default function PropertyFeatures({
  quartos,
  suites,
  banheiros,
  vagas,
  areaUtil,
  areaTotal,
  andar,
  anoConstrucao,
  mobilia,
  regraPet,
  primaryColor = '#F97316',
  textColor,
}: PropertyFeaturesProps) {
  const features = [
    { icon: Maximize, value: areaUtil || areaTotal, label: 'm²', show: !!(areaUtil || areaTotal) },
    { icon: Bed, value: quartos, label: quartos === 1 ? 'Quarto' : 'Quartos', show: !!quartos },
    { icon: Layers, value: suites, label: suites === 1 ? 'Suíte' : 'Suítes', show: !!suites },
    { icon: Bath, value: banheiros, label: banheiros === 1 ? 'Banheiro' : 'Banheiros', show: !!banheiros },
    { icon: Car, value: vagas, label: vagas === 1 ? 'Vaga' : 'Vagas', show: !!vagas },
    { icon: Building2, value: andar, label: 'Andar', show: !!andar },
  ].filter(f => f.show);

  const additionalFeatures = [
    { icon: Calendar, value: anoConstrucao, label: 'Ano de Construção', show: !!anoConstrucao },
    { icon: Sofa, value: mobilia, label: 'Mobília', show: !!mobilia },
    { icon: PawPrint, value: regraPet ? 'Sim' : 'Não', label: 'Aceita Pet', show: regraPet !== null && regraPet !== undefined },
  ].filter(f => f.show);

  if (features.length === 0 && additionalFeatures.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Main Features - Grid 2 columns on mobile, flex on desktop */}
      {features.length > 0 && (
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index} 
                className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl"
                style={{ backgroundColor: `${primaryColor}10` }}
              >
                <div 
                  className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${primaryColor}15` }}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: primaryColor }} />
                </div>
                <span className="text-sm md:text-base" style={{ color: textColor }}>
                  <span className="font-bold">{feature.value}</span>{' '}
                  <span className="font-normal" style={{ opacity: 0.6 }}>{feature.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Additional Features - Grid 2 columns on mobile, flex on desktop */}
      {additionalFeatures.length > 0 && (
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3">
          {additionalFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index} 
                className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl"
                style={{ backgroundColor: `${primaryColor}10` }}
              >
                <div 
                  className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${primaryColor}15` }}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: primaryColor }} />
                </div>
                <span className="text-sm md:text-base" style={{ color: textColor }}>
                  <span className="font-normal" style={{ opacity: 0.6 }}>{feature.label}:</span>{' '}
                  <span className="font-bold">{feature.value}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
