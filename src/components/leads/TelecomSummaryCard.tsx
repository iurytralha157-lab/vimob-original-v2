import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, MapPin, FileEdit, CreditCard } from 'lucide-react';
import type { TelecomCustomerByLead } from '@/hooks/use-telecom-customer-by-lead';

interface TelecomSummaryCardProps {
  customer: TelecomCustomerByLead;
  onEdit: () => void;
}

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
  cancelled: 'Cancelado',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  inactive: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function TelecomSummaryCard({ customer, onEdit }: TelecomSummaryCardProps) {
  const address = [customer.address, customer.number && `nº ${customer.number}`]
    .filter(Boolean)
    .join(', ');
  const location = [customer.neighborhood, customer.city, customer.uf]
    .filter(Boolean)
    .join(' - ');
  const hasAddress = address || location;

  return (
    <div className="rounded-xl bg-gradient-to-br from-card to-muted/30 border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="font-medium text-sm">Dados do Cliente</h3>
        </div>
        <div className="flex items-center gap-2">
          {customer.status && (
            <Badge className={`text-[10px] px-2 py-0.5 border-0 ${statusColors[customer.status] || statusColors.pending}`}>
              {statusLabels[customer.status] || customer.status}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 rounded-full text-xs">
            <FileEdit className="h-3 w-3 mr-1" />
            Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {customer.cpf_cnpj && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-background/50">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">CPF/CNPJ</p>
              <p className="text-xs font-medium truncate">{customer.cpf_cnpj}</p>
            </div>
          </div>
        )}
        {customer.rg && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-background/50">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">RG</p>
              <p className="text-xs font-medium truncate">{customer.rg}</p>
            </div>
          </div>
        )}
      </div>

      {hasAddress && (
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-background/50">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Endereço</p>
            {address && <p className="text-xs font-medium truncate">{address}</p>}
            {location && <p className="text-[10px] text-muted-foreground truncate">{location}</p>}
          </div>
        </div>
      )}

      {customer.plan && (
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-primary/5 border border-primary/10">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CreditCard className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground">Plano</p>
            <p className="text-xs font-medium truncate">{customer.plan.code} - {customer.plan.name}</p>
          </div>
          <span className="text-xs font-semibold text-primary shrink-0">
            R$ {customer.plan.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}
