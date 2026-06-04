import { useDashboardAlerts } from "@/hooks/use-dashboard-alerts";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function DashboardAlertBar() {
  const { data: alerts, isLoading } = useDashboardAlerts();
  const navigate = useNavigate();

  if (isLoading || !alerts || alerts.total === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {alerts.purchases.length > 0 && (
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <div>
              <AlertTitle className="text-xs font-bold uppercase tracking-tight">Suprimentos Atrasados</AlertTitle>
              <AlertDescription className="text-xs">
                Existem {alerts.purchases.length} pedidos de compra com entrega atrasada.
              </AlertDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-red-800 hover:bg-red-100 h-8 text-xs font-bold"
            onClick={() => navigate("/obras/compras")}
          >
            Ver Detalhes
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Alert>
      )}

      {alerts.finance.length > 0 && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-800 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-amber-600" />
            <div>
              <AlertTitle className="text-xs font-bold uppercase tracking-tight">Financeiro Pendente</AlertTitle>
              <AlertDescription className="text-xs">
                Você possui {alerts.finance.length} contas vencidas aguardando pagamento.
              </AlertDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-amber-800 hover:bg-amber-100 h-8 text-xs font-bold"
            onClick={() => navigate("/financeiro/contas")}
          >
            Ir para Contas
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Alert>
      )}
    </div>
  );
}
