import { useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadCalls, formatCallDuration, TelephonyCall } from "@/hooks/use-telephony";
import { RecordingPlayer } from "./RecordingPlayer";

interface LeadCallsSectionProps {
  leadId: string;
}

export function LeadCallsSection({ leadId }: LeadCallsSectionProps) {
  const { data: calls, isLoading } = useLeadCalls(leadId);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Ligações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Ligações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma ligação registrada
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" />
          Ligações ({calls.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {calls.map((call) => (
          <CallItem 
            key={call.id} 
            call={call} 
            isPlaying={playingCallId === call.id}
            onPlay={() => setPlayingCallId(playingCallId === call.id ? null : call.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface CallItemProps {
  call: TelephonyCall;
  isPlaying: boolean;
  onPlay: () => void;
}

function CallItem({ call, isPlaying, onPlay }: CallItemProps) {
  const getStatusIcon = () => {
    if (call.status === 'missed' || call.status === 'no_answer') {
      return <PhoneMissed className="h-4 w-4 text-destructive" />;
    }
    if (call.direction === 'inbound') {
      return <PhoneIncoming className="h-4 w-4 text-blue-500" />;
    }
    return <PhoneOutgoing className="h-4 w-4 text-green-500" />;
  };

  const getStatusBadge = () => {
    switch (call.status) {
      case 'answered':
      case 'ended':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">Atendida</Badge>;
      case 'missed':
      case 'no_answer':
        return <Badge variant="destructive">Perdida</Badge>;
      case 'initiated':
        return <Badge variant="secondary">Iniciada</Badge>;
      case 'busy':
        return <Badge variant="outline">Ocupado</Badge>;
      default:
        return <Badge variant="outline">{call.status}</Badge>;
    }
  };

  const hasRecording = call.recording_status === 'ready' && (call.recording_url || call.recording_storage_path);

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">
            {call.direction === 'inbound' ? 'Recebida' : 'Realizada'}
          </span>
          {getStatusBadge()}
        </div>
        <span className="text-xs text-muted-foreground">
          {call.initiated_at && format(new Date(call.initiated_at), "dd/MM HH:mm", { locale: ptBR })}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          {call.user && (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarImage src={call.user.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {call.user.name?.charAt(0) || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground">{call.user.name}</span>
            </div>
          )}
          {call.duration_seconds && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatCallDuration(call.duration_seconds)}
            </div>
          )}
        </div>

        {hasRecording && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1"
            onClick={onPlay}
          >
            <Play className="h-3 w-3" />
            Ouvir
          </Button>
        )}
      </div>

      {call.outcome && (
        <p className="text-xs text-muted-foreground">
          Resultado: {call.outcome}
        </p>
      )}

      {call.notes && (
        <p className="text-xs text-muted-foreground italic">
          {call.notes}
        </p>
      )}

      {isPlaying && hasRecording && (
        <RecordingPlayer callId={call.id} onClose={onPlay} />
      )}
    </div>
  );
}
