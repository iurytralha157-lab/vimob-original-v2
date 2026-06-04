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
import { Textarea } from '@/components/ui/textarea';
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
import type { ServicePlan, CreateServicePlanInput } from '@/hooks/use-service-plans';

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: ServicePlan | null;
  onSubmit: (data: CreateServicePlanInput) => void;
  isLoading?: boolean;
}

const defaultFormData: CreateServicePlanInput = {
  code: '',
  name: '',
  category: 'PF',
  price: null,
  speed_mb: null,
  description: '',
  features: [],
  is_active: true,
  is_promo: false,
};

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  onSubmit,
  isLoading,
}: PlanFormDialogProps) {
  const [formData, setFormData] = useState<CreateServicePlanInput>(defaultFormData);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (plan) {
      setFormData({
        code: plan.code,
        name: plan.name,
        category: plan.category,
        price: plan.price,
        speed_mb: plan.speed_mb,
        description: plan.description || '',
        features: plan.features || [],
        is_active: plan.is_active,
        is_promo: plan.is_promo,
      });
    } else {
      setFormData(defaultFormData);
    }
  }, [plan, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData({
        ...formData,
        features: [...(formData.features || []), newFeature.trim()],
      });
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    setFormData({
      ...formData,
      features: formData.features?.filter((_, i) => i !== index),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] sm:max-w-[500px] sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          <DialogDescription>
            {plan 
              ? 'Altere as informações do plano de serviço.' 
              : 'Cadastre um novo plano de serviço.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => 
                  setFormData({ ...formData, category: value as 'PF' | 'PJ' | 'MOVEL' | 'ADICIONAL' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  <SelectItem value="MOVEL">Móvel</SelectItem>
                  <SelectItem value="ADICIONAL">Adicional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome do Plano *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Internet 300 Mega"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Valor (R$)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price ?? ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  price: e.target.value ? parseFloat(e.target.value) : null 
                })}
                placeholder="99.90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="speed_mb">Velocidade (MB)</Label>
              <Input
                id="speed_mb"
                type="number"
                min="0"
                value={formData.speed_mb ?? ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  speed_mb: e.target.value ? parseInt(e.target.value) : null 
                })}
                placeholder="300"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição do plano..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Benefícios</Label>
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                placeholder="WiFi 6, McAfee, etc."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFeature();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={addFeature}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.features && formData.features.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.features.map((feature, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {feature}
                    <button
                      type="button"
                      onClick={() => removeFeature(i)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active" className="font-normal">Ativo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_promo"
                checked={formData.is_promo}
                onCheckedChange={(checked) => setFormData({ ...formData, is_promo: checked })}
              />
              <Label htmlFor="is_promo" className="font-normal">Promocional</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="w-[40%] rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="w-[60%] rounded-xl" disabled={isLoading}>
              {isLoading ? 'Salvando...' : plan ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
