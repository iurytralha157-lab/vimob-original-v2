import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';
import { ContactFormDialog } from '@/components/public/ContactFormDialog';

interface PropertyPricingProps {
  preco?: number | null;
  valorLocacao?: number | null;
  tipoNegocio?: string | null;
  condominio?: number | null;
  iptu?: number | null;
  seguroIncendio?: number | null;
  taxaServico?: number | null;
  codigo: string;
  codigoExterno?: string | null;
  titulo: string;
  propertyId?: string;
  organizationId: string;
  whatsappNumber?: string | null;
  phoneNumber?: string | null;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
}

export default function PropertyPricing({
  preco,
  valorLocacao,
  tipoNegocio,
  condominio,
  iptu,
  seguroIncendio,
  taxaServico,
  codigo,
  codigoExterno,
  titulo,
  propertyId,
  organizationId,
  whatsappNumber,
  phoneNumber,
  primaryColor = '#F97316',
  cardColor = '#FFFFFF',
  textColor,
}: PropertyPricingProps) {
  const formatPrice = (value: number | null | undefined) => {
    if (!value) return null;
    return value.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };

  const tipo = tipoNegocio?.toLowerCase() || '';
  const isRentOnly = tipo.includes('aluguel') && !tipo.includes('venda');
  const isSaleOnly = tipo.includes('venda') && !tipo.includes('aluguel');
  const isBoth = tipo.includes('venda') && tipo.includes('aluguel');

  // Determine the main price to show as rental for total calculation
  // For rent-only: preco IS the rental value
  // For sale+rent or when valorLocacao exists: valorLocacao is the rental value
  const rentalValue = isRentOnly ? (preco || 0) : (valorLocacao || 0);
  const saleValue = isRentOnly ? null : preco;
  const hasRental = isRentOnly || !!valorLocacao || isBoth;

  // Additional monthly costs
  const additionalCosts = [
    { label: 'Condomínio', value: condominio },
    { label: 'IPTU', value: iptu },
    { label: 'Seguro Incêndio', value: seguroIncendio },
    { label: 'Taxa de Serviço', value: taxaServico },
  ].filter(c => c.value);

  const totalMonthlyCost = hasRental && rentalValue
    ? rentalValue + additionalCosts.reduce((sum, c) => sum + (c.value || 0), 0)
    : null;

  return (
    <Card className="rounded-2xl sticky top-24" style={{ backgroundColor: cardColor, borderColor: textColor ? `${textColor}15` : undefined }}>
      <CardContent className="p-6 space-y-6">
        {/* Main Price */}
        {isRentOnly && preco ? (
          /* Rental-only: show rental as main price */
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: textColor, opacity: 0.6 }}>
              Valor de Locação
            </p>
            <p className="text-3xl md:text-4xl font-bold" style={{ color: primaryColor }}>
              {formatPrice(preco)}
              <span className="text-lg font-normal" style={{ color: textColor, opacity: 0.5 }}>/mês</span>
            </p>
          </div>
        ) : saleValue ? (
          /* Sale or Sale+Rent: show sale price on top */
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: textColor, opacity: 0.6 }}>
              {isBoth || valorLocacao ? 'Valor de Venda' : 'Valor'}
            </p>
            <p className="text-3xl md:text-4xl font-bold" style={{ color: primaryColor }}>
              {formatPrice(saleValue)}
            </p>
          </div>
        ) : null}

        {/* Rental Value below (for sale+rental properties) */}
        {!isRentOnly && valorLocacao && (
          <div className="pt-4" style={{ borderTopWidth: 1, borderTopColor: textColor ? `${textColor}15` : undefined }}>
            <p className="text-sm font-medium mb-1" style={{ color: textColor, opacity: 0.6 }}>
              Valor de Locação
            </p>
            <p className="text-xl font-bold" style={{ color: primaryColor, opacity: 0.85 }}>
              {formatPrice(valorLocacao)}
              <span className="text-sm font-normal" style={{ color: textColor, opacity: 0.5 }}>/mês</span>
            </p>
          </div>
        )}

        {/* Additional Costs */}
        {additionalCosts.length > 0 && (
          <div className="space-y-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: textColor ? `${textColor}15` : undefined }}>
            {additionalCosts.map((cost, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: textColor, opacity: 0.6 }}>{cost.label}</span>
                <span className="font-medium" style={{ color: textColor }}>{formatPrice(cost.value)}</span>
              </div>
            ))}
            
            {/* Total Monthly for Rent */}
            {hasRental && totalMonthlyCost && (
              <div className="flex justify-between items-center pt-3" style={{ borderTopWidth: 1, borderTopColor: textColor ? `${textColor}15` : undefined }}>
                <span className="font-semibold" style={{ color: textColor, opacity: 0.8 }}>Total Mensal</span>
                <span className="font-bold text-lg" style={{ color: primaryColor }}>
                  {formatPrice(totalMonthlyCost)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contact Form */}
        <div className="pt-4" style={{ borderTopWidth: 1, borderTopColor: textColor ? `${textColor}15` : undefined }}>
          <ContactFormDialog
            organizationId={organizationId}
            propertyId={propertyId}
            propertyCode={codigo}
            propertyTitle={titulo}
            whatsappNumber={whatsappNumber || undefined}
            primaryColor={primaryColor}
            trigger={
              <Button
                className="w-full rounded-xl h-14 text-base font-semibold gap-2 text-white transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                <MessageCircle className="w-5 h-5" />
                Tenho Interesse
              </Button>
            }
          />
          <p className="text-sm mt-3 text-center" style={{ color: textColor, opacity: 0.5 }}>
            Preencha o formulário para receber mais informações
          </p>
        </div>

        {/* Property Codes */}
        <div className="pt-4 flex items-center justify-center gap-6" style={{ borderTopWidth: 1, borderTopColor: textColor ? `${textColor}15` : undefined }}>
          <div className="text-center">
            <p className="text-xs" style={{ color: textColor, opacity: 0.4 }}>Código</p>
            <p className="font-mono font-semibold text-sm" style={{ color: textColor, opacity: 0.7 }}>{codigo}</p>
          </div>
          {codigoExterno && (
            <>
              <div className="h-8 w-px" style={{ backgroundColor: textColor ? `${textColor}15` : '#e5e7eb' }} />
              <div className="text-center">
                <p className="text-xs" style={{ color: textColor, opacity: 0.4 }}>Cód. Externo</p>
                <p className="font-mono font-semibold text-sm" style={{ color: textColor, opacity: 0.7 }}>{codigoExterno}</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
