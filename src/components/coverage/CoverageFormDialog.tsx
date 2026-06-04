import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import type { CoverageArea, CreateCoverageAreaInput } from '@/hooks/use-coverage-areas';

interface CoverageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area?: CoverageArea | null;
  existingUFs?: string[];
  existingCities?: { uf: string; city: string }[];
  onSubmit: (data: CreateCoverageAreaInput) => void;
  onSubmitBatch?: (data: CreateCoverageAreaInput[]) => void;
  isLoading?: boolean;
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export function CoverageFormDialog({
  open,
  onOpenChange,
  area,
  existingUFs = [],
  existingCities = [],
  onSubmit,
  onSubmitBatch,
  isLoading,
}: CoverageFormDialogProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [formData, setFormData] = useState<CreateCoverageAreaInput>({
    uf: '',
    city: '',
    neighborhood: '',
    zone: '',
    is_active: true,
  });
  const [batchNeighborhoods, setBatchNeighborhoods] = useState<string[]>([]);
  const [newNeighborhood, setNewNeighborhood] = useState('');

  useEffect(() => {
    if (area) {
      setFormData({
        uf: area.uf,
        city: area.city,
        neighborhood: area.neighborhood,
        zone: area.zone || '',
        is_active: area.is_active,
      });
      setMode('single');
    } else {
      setFormData({
        uf: '',
        city: '',
        neighborhood: '',
        zone: '',
        is_active: true,
      });
      setBatchNeighborhoods([]);
    }
  }, [area, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'batch' && onSubmitBatch && batchNeighborhoods.length > 0) {
      const areas = batchNeighborhoods.map(neighborhood => ({
        uf: formData.uf,
        city: formData.city,
        neighborhood,
        zone: formData.zone || null,
        is_active: formData.is_active,
      }));
      onSubmitBatch(areas);
    } else {
      onSubmit(formData);
    }
  };

  const addNeighborhood = () => {
    if (newNeighborhood.trim() && !batchNeighborhoods.includes(newNeighborhood.trim())) {
      setBatchNeighborhoods([...batchNeighborhoods, newNeighborhood.trim()]);
      setNewNeighborhood('');
    }
  };

  const removeNeighborhood = (index: number) => {
    setBatchNeighborhoods(batchNeighborhoods.filter((_, i) => i !== index));
  };

  const citiesForSelectedUF = existingCities
    .filter(c => c.uf === formData.uf)
    .map(c => c.city)
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] sm:max-w-[500px] sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle>
            {area ? 'Editar Localidade' : 'Nova Localidade'}
          </DialogTitle>
          <DialogDescription>
            {area 
              ? 'Altere as informações da localidade.' 
              : 'Cadastre áreas de cobertura que sua empresa atende.'}
          </DialogDescription>
        </DialogHeader>

        {!area && (
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <Button
              type="button"
              variant={mode === 'single' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('single')}
            >
              Único
            </Button>
            <Button
              type="button"
              variant={mode === 'batch' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('batch')}
            >
              Múltiplos Bairros
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="uf">UF *</Label>
              <Select
                value={formData.uf}
                onValueChange={(value) => setFormData({ ...formData, uf: value, city: '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map(uf => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade *</Label>
              {citiesForSelectedUF.length > 0 ? (
                <Select
                  value={formData.city}
                  onValueChange={(value) => setFormData({ ...formData, city: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione ou digite" />
                  </SelectTrigger>
                  <SelectContent>
                    {citiesForSelectedUF.map(city => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Nova cidade...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Nome da cidade"
                  required
                />
              )}
            </div>
          </div>

          {formData.city === '__new__' && (
            <div className="space-y-2">
              <Label htmlFor="newCity">Nome da Nova Cidade *</Label>
              <Input
                id="newCity"
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Digite o nome da cidade"
                required
              />
            </div>
          )}

          {mode === 'single' ? (
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Bairro *</Label>
              <Input
                id="neighborhood"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                placeholder="Nome do bairro"
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Bairros *</Label>
              <div className="flex gap-2">
                <Input
                  value={newNeighborhood}
                  onChange={(e) => setNewNeighborhood(e.target.value)}
                  placeholder="Digite o nome do bairro"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNeighborhood();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={addNeighborhood}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {batchNeighborhoods.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                  {batchNeighborhoods.map((neighborhood, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {neighborhood}
                      <button
                        type="button"
                        onClick={() => removeNeighborhood(i)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {batchNeighborhoods.length} bairro(s) selecionado(s)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="zone">Zona (opcional)</Label>
            <Input
              id="zone"
              value={formData.zone || ''}
              onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
              placeholder="Centro, Zona Norte, etc."
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active" className="font-normal">
              Ativo (atendemos esta localidade)
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="w-[40%] rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="w-[60%] rounded-xl"
              disabled={isLoading || (mode === 'batch' && batchNeighborhoods.length === 0)}
            >
              {isLoading ? 'Salvando...' : area ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
