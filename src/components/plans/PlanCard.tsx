import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Wifi, 
  Smartphone, 
  Building2, 
  Package, 
  Pencil, 
  Trash2,
  Zap,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServicePlan } from '@/hooks/use-service-plans';

interface PlanCardProps {
  plan: ServicePlan;
  onEdit?: (plan: ServicePlan) => void;
  onDelete?: (plan: ServicePlan) => void;
}

const categoryConfig = {
  PF: { label: 'Pessoa Física', icon: Wifi, color: 'bg-blue-500' },
  PJ: { label: 'Pessoa Jurídica', icon: Building2, color: 'bg-purple-500' },
  MOVEL: { label: 'Móvel', icon: Smartphone, color: 'bg-green-500' },
  ADICIONAL: { label: 'Adicional', icon: Package, color: 'bg-orange-500' },
};

export function PlanCard({ plan, onEdit, onDelete }: PlanCardProps) {
  const category = categoryConfig[plan.category];
  const CategoryIcon = category.icon;

  const formatPrice = (price: number | null) => {
    if (!price) return 'Sob consulta';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-md",
      !plan.is_active && "opacity-60"
    )}>
      {plan.is_promo && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-yellow-500 text-yellow-950">
            <Star className="h-3 w-3 mr-1" />
            Promo
          </Badge>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg", category.color)}>
            <CategoryIcon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">
              {plan.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Código: {plan.code}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 md:px-6 pb-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {category.label}
          </Badge>
          {plan.speed_mb && (
            <div className="flex items-center gap-1 text-sm font-medium">
              <Zap className="h-3 w-3 text-yellow-500" />
              {plan.speed_mb} MB
            </div>
          )}
        </div>

        <div className="text-2xl font-bold text-primary">
          {formatPrice(plan.price)}
          {plan.price && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
        </div>

        {plan.features && plan.features.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {plan.features.slice(0, 3).map((feature, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {feature}
              </Badge>
            ))}
            {plan.features.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{plan.features.length - 3}
              </Badge>
            )}
          </div>
        )}

        {(onEdit || onDelete) && (
          <div className="flex gap-2 pt-3 border-t">
            {onEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => onEdit(plan)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Editar
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="outline" 
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(plan)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
