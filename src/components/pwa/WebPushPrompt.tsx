import { useState, useEffect } from 'react';
import { X, Bell, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebPush } from '@/hooks/use-web-push';
import { useAuth } from '@/contexts/AuthContext';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

const DISMISS_KEY = 'web-push-prompt-dismissed';
const DISMISS_DURATION_DAYS = 7;

export function WebPushPrompt() {
  const { user } = useAuth();
  const { 
    isSupported, 
    isSubscribed, 
    isLoading, 
    permission,
    subscribe 
  } = useWebPush();
  
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Verifica se deve mostrar o prompt
  useEffect(() => {
    // Não mostra em apps nativos (usa push nativo via Capacitor)
    if (Capacitor.isNativePlatform()) {
      setShowPrompt(false);
      return;
    }

    // Não mostra se não está logado
    if (!user?.id) {
      setShowPrompt(false);
      return;
    }

    // Não mostra se não é suportado
    if (!isSupported) {
      setShowPrompt(false);
      return;
    }

    // Não mostra se já está inscrito
    if (isSubscribed) {
      setShowPrompt(false);
      return;
    }

    // Não mostra se já negou permissão
    if (permission === 'denied') {
      setShowPrompt(false);
      return;
    }

    // Não mostra se está carregando
    if (isLoading) {
      return;
    }

    // Verifica se foi dispensado recentemente
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissedDate = new Date(parseInt(dismissedAt, 10));
      const now = new Date();
      const diffDays = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diffDays < DISMISS_DURATION_DAYS) {
        setShowPrompt(false);
        return;
      }
    }

    // Mostra o prompt após um pequeno delay
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [user?.id, isSupported, isSubscribed, isLoading, permission]);

  const handleEnable = async () => {
    setIsSubscribing(true);
    
    const success = await subscribe();
    
    setIsSubscribing(false);
    
    if (success) {
      toast.success('Notificações ativadas com sucesso!');
      setShowPrompt(false);
    } else {
      toast.error('Não foi possível ativar as notificações. Verifique as permissões do navegador.');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowPrompt(false);
  };

  // Não renderiza se usuário não está logado (proteção adicional)
  if (!user?.id) {
    return null;
  }

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t border-border shadow-lg animate-in slide-in-from-bottom duration-300">
      <div className="max-w-lg mx-auto flex items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center overflow-hidden">
          <img src="/icons/apple-touch-icon.png" alt="App Icon" className="w-8 h-8 object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">
            Ativar notificações
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            Receba alertas de novos leads e mensagens
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDismiss}
            disabled={isSubscribing}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleEnable}
            disabled={isSubscribing}
          >
            <Bell className="h-4 w-4" />
            {isSubscribing ? 'Ativando...' : 'Ativar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
