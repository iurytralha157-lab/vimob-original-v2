import React from "react";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FilterState {
  search: string;
  tipo: string;
  finalidade: string;
  cidade: string;
  bairro: string;
  quartos: string;
  suites: string;
  minPrice: string;
  maxPrice: string;
  banheiros: string;
  vagas: string;
  mobilia: string;
  page: number;
}

interface PropertyFiltersContentProps {
  localSearch: string;
  setLocalSearch: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  filters: FilterState;
  updateFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  cities: string[];
  neighborhoods: string[];
  propertyTypes: string[];
  showMoreFilters: boolean;
  setShowMoreFilters: (value: boolean) => void;
  onClose?: () => void;
  textColor?: string;
  cardColor?: string;
}

const PropertyFiltersContent = React.memo(function PropertyFiltersContent({
  localSearch,
  setLocalSearch,
  searchInputRef,
  filters,
  updateFilter,
  clearFilters,
  hasActiveFilters,
  cities,
  neighborhoods,
  propertyTypes,
  showMoreFilters,
  setShowMoreFilters,
  onClose,
  textColor,
  cardColor,
}: PropertyFiltersContentProps) {
  // Build dynamic input styles for dark themes
  const inputStyle = textColor && cardColor ? {
    backgroundColor: `${textColor}10`,
    color: textColor,
    borderColor: `${textColor}20`,
  } : undefined;
  return (
    <div className="space-y-4">
      {/* Basic Filters - Always visible */}
      <div>
        <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Buscar</label>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Código, localização, bairro..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="flex h-10 w-full rounded-xl border px-4 py-2 text-base ring-offset-background placeholder:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
          style={inputStyle || { backgroundColor: 'hsl(var(--muted))' }}
        />
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Cidade</label>
        <Select value={filters.cidade} onValueChange={(v) => updateFilter('cidade', v === 'all' ? '' : v)}>
          <SelectTrigger className="rounded-xl" style={inputStyle}>
            <SelectValue placeholder="Todas as cidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Bairro</label>
        <Select value={filters.bairro} onValueChange={(v) => updateFilter('bairro', v === 'all' ? '' : v)}>
          <SelectTrigger className="rounded-xl" style={inputStyle}>
            <SelectValue placeholder="Todos os bairros" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os bairros</SelectItem>
            {neighborhoods.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Faixa de Preço</label>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            placeholder="Mínimo"
            value={filters.minPrice}
            onChange={(e) => updateFilter('minPrice', e.target.value)}
            className="rounded-xl"
            style={inputStyle}
          />
          <Input
            type="number"
            placeholder="Máximo"
            value={filters.maxPrice}
            onChange={(e) => updateFilter('maxPrice', e.target.value)}
            className="rounded-xl"
            style={inputStyle}
          />
        </div>
      </div>

      {/* More Filters - Collapsible */}
      <Collapsible open={showMoreFilters} onOpenChange={setShowMoreFilters}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <span className="font-semibold" style={textColor ? { color: textColor } : undefined}>Mais Filtros</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Tipo de Imóvel</label>
            <Select value={filters.tipo} onValueChange={(v) => updateFilter('tipo', v === 'all' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {propertyTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Finalidade</label>
            <Select value={filters.finalidade} onValueChange={(v) => updateFilter('finalidade', v === 'all' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="venda">Venda</SelectItem>
                <SelectItem value="aluguel">Aluguel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Quartos</label>
            <Select value={filters.quartos} onValueChange={(v) => updateFilter('quartos', v === 'any' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="1">1+ quarto</SelectItem>
                <SelectItem value="2">2+ quartos</SelectItem>
                <SelectItem value="3">3+ quartos</SelectItem>
                <SelectItem value="4">4+ quartos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Suítes</label>
            <Select value={filters.suites} onValueChange={(v) => updateFilter('suites', v === 'any' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="1">1+ suíte</SelectItem>
                <SelectItem value="2">2+ suítes</SelectItem>
                <SelectItem value="3">3+ suítes</SelectItem>
                <SelectItem value="4">4+ suítes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Banheiros</label>
            <Select value={filters.banheiros} onValueChange={(v) => updateFilter('banheiros', v === 'any' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="1">1+ banheiro</SelectItem>
                <SelectItem value="2">2+ banheiros</SelectItem>
                <SelectItem value="3">3+ banheiros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Vagas</label>
            <Select value={filters.vagas} onValueChange={(v) => updateFilter('vagas', v === 'any' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="1">1+ vaga</SelectItem>
                <SelectItem value="2">2+ vagas</SelectItem>
                <SelectItem value="3">3+ vagas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block" style={textColor ? { color: textColor } : undefined}>Mobília</label>
            <Select value={filters.mobilia || 'all'} onValueChange={(v) => updateFilter('mobilia', v === 'all' ? '' : v)}>
              <SelectTrigger className="rounded-xl" style={inputStyle}>
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer</SelectItem>
                <SelectItem value="mobiliado">Mobiliado</SelectItem>
                <SelectItem value="semi">Semi-mobiliado</SelectItem>
                <SelectItem value="sem">Sem mobília</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasActiveFilters && (
        <Button 
          variant="destructive" 
          className="w-full rounded-xl" 
          onClick={() => {
            clearFilters();
            onClose?.();
          }}
        >
          <X className="w-4 h-4 mr-2" />
          Limpar todos os filtros
        </Button>
      )}
    </div>
  );
});

export default PropertyFiltersContent;
