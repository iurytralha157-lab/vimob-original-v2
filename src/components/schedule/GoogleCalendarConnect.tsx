import { Calendar, Check, Link2, Unlink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  useGoogleCalendarStatus, 
  useConnectGoogleCalendar, 
  useDisconnectGoogleCalendar,
  useToggleGoogleCalendarSync 
} from '@/hooks/use-google-calendar';

export function GoogleCalendarConnect() {
  const { data: calendarStatus, isLoading } = useGoogleCalendarStatus();
  const connectCalendar = useConnectGoogleCalendar();
  const disconnectCalendar = useDisconnectGoogleCalendar();
  const toggleSync = useToggleGoogleCalendarSync();

  const isConnected = !!calendarStatus;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Google Calendar</CardTitle>
            <CardDescription>
              {isConnected 
                ? 'Sua agenda está conectada' 
                : 'Conecte para sincronizar suas atividades'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg border border-success/20">
              <div className="flex items-center gap-2 text-success">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Conectado</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => disconnectCalendar.mutate()}
                disabled={disconnectCalendar.isPending}
              >
                <Unlink className="h-4 w-4 mr-2" />
                Desconectar
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="sync-enabled" className="flex flex-col gap-1">
                <span>Sincronização automática</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Sincronizar atividades automaticamente
                </span>
              </Label>
              <Switch
                id="sync-enabled"
                checked={!!calendarStatus?.calendar_id}
                onCheckedChange={(checked) => toggleSync.mutate(checked ? 'primary' : '')}
              />
            </div>
          </>
        ) : (
          <Button
            className="w-full"
            onClick={() => connectCalendar.mutate()}
            disabled={connectCalendar.isPending}
          >
            <Link2 className="h-4 w-4 mr-2" />
            {connectCalendar.isPending ? 'Conectando...' : 'Conectar Google Calendar'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
