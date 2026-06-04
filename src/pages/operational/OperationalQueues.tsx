import { AppLayout } from "@/components/layout/AppLayout";
import { useOperationalRequests } from "@/hooks/use-operational";
import { 
  Card, 
  CardContent, 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Badge 
} from "@/components/ui/badge";
import { 
  Loader2, 
  Clock, 
  AlertCircle,
  HardHat,
  Wallet,
  Compass,
  ShoppingCart,
  User,
  Inbox
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function OperationalQueues() {
  const { data: requests, isLoading } = useOperationalRequests();

  const getIcon = (type: string) => {
    switch (type) {
      case 'finance': return <Wallet className="h-4 w-4 text-emerald-500" />;
      case 'architecture': return <Compass className="h-4 w-4 text-blue-500" />;
      case 'engineering': return <HardHat className="h-4 w-4 text-orange-500" />;
      case 'purchase': return <ShoppingCart className="h-4 w-4 text-purple-500" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>;
      case 'in_analysis': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Em Análise</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Aprovado</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejeitado</Badge>;
      case 'completed': return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Concluído</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout title="Filas Operacionais">
      <div className="space-y-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 md:grid-cols-5 h-auto p-1 bg-muted/50 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg">Todas</TabsTrigger>
            <TabsTrigger value="finance" className="gap-2 rounded-lg">
              <Wallet className="h-4 w-4" /> Financeiro
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-2 rounded-lg">
              <Compass className="h-4 w-4" /> Arquitetura
            </TabsTrigger>
            <TabsTrigger value="engineering" className="gap-2 rounded-lg">
              <HardHat className="h-4 w-4" /> Engenharia
            </TabsTrigger>
            <TabsTrigger value="purchase" className="gap-2 rounded-lg">
              <ShoppingCart className="h-4 w-4" /> Compras
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
             {isLoading ? (
               <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
             ) : requests?.length === 0 ? (
               <EmptyState />
             ) : (
               <div className="grid grid-cols-1 gap-4">
                 {requests?.map(request => (
                   <RequestCard key={request.id} request={request} getIcon={getIcon} getStatusBadge={getStatusBadge} />
                 ))}
               </div>
             )}
          </TabsContent>

          {['finance', 'architecture', 'engineering', 'purchase'].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-6">
               <div className="grid grid-cols-1 gap-4">
                 {requests?.filter(r => r.type === tab).map(request => (
                   <RequestCard key={request.id} request={request} getIcon={getIcon} getStatusBadge={getStatusBadge} />
                 ))}
                 {requests?.filter(r => r.type === tab).length === 0 && <EmptyState />}
               </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function RequestCard({ request, getIcon, getStatusBadge }: any) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer border-none shadow-sm">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-muted/30`}>
          {getIcon(request.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold truncate">{request.title}</h4>
            {getStatusBadge(request.status)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-medium">
            {request.lead && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> Lead: <span className="text-foreground">{request.lead.name}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {format(new Date(request.created_at), "dd MMM HH:mm", { locale: ptBR })}
            </span>
            {request.due_date && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="h-3 w-3" /> SLA: {format(new Date(request.due_date), "dd/MM")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:ml-auto">
          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
            {request.priority}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed py-12 text-center bg-transparent">
       <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
       <p className="text-muted-foreground">Fila vazia. Tudo em dia!</p>
    </Card>
  );
}
