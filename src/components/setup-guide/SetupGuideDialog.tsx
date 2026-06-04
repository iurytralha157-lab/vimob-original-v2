import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useSetupGuide, type SetupStep } from '@/hooks/use-setup-guide';
import { startSetupTour } from '@/components/setup-guide/setup-tour';
import {
  X,
  Check,
  Circle,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  Users,
  Workflow,
  Building2,
  Globe,
  Zap,
  CreditCard,
  Smartphone,
  RotateCcw,
  UserCircle,
  Contact,
  MessagesSquare,
  Columns3,
  LayoutDashboard,
  Facebook,
  FileCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, any> = {
  MessageCircle,
  UserPlus,
  Users,
  Workflow,
  Building2,
  Globe,
  Zap,
  CreditCard,
  Smartphone,
  UserCircle,
  Contact,
  MessagesSquare,
  Columns3,
  LayoutDashboard,
  Facebook,
  FileCog,
};

export function SetupGuideDialog() {
  const { profile } = useAuth();
  const {
    steps,
    progress,
    open,
    setOpen,
    markComplete,
    skipAll,
    restart,
    completedCount,
    totalCount,
    percent,
    setActiveStepId,
  } = useSetupGuide();
  const navigate = useNavigate();
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  const firstName = profile?.name?.split(' ')[0]?.toUpperCase() || 'USUÁRIO';

  const handleStart = (step: SetupStep) => {
    if (!step.route) {
      console.warn(`[SetupGuide] Step "${step.id}" não possui rota definida.`);
      return;
    }

    setActiveStepId(step.id);
    setOpen(false);
    navigate(step.route);

    if (step.tourTarget) {
      setTimeout(() => {
        startSetupTour({
          target: step.tourTarget!,
          stepId: step.id,
          onComplete: () => {
            markComplete(step.id);
            setActiveStepId(null);
          },
        });
      }, 600);
    }
  };

  const handleToggle = (step: SetupStep) => {
    if (progress[step.id]) return;
    markComplete(step.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 overflow-hidden max-w-[900px] w-[95vw] h-[92vh] md:h-[680px] md:max-h-[92vh] gap-0 border-border/50 [&>button]:hidden"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[260px_1fr]">
          <div className="relative bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-4 md:p-6 flex md:flex-col md:justify-between items-center md:items-stretch gap-3 md:gap-0">
            <div className="flex items-center md:flex-col md:items-center md:justify-center md:my-6 shrink-0">
              <div className="relative w-14 h-14 md:w-28 md:h-28">
                <svg className="w-14 h-14 md:w-28 md:h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="none"
                    className="text-primary-foreground/20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray={`${(percent / 100) * 264} 264`}
                    strokeLinecap="round"
                    className="text-primary-foreground transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs md:text-2xl font-bold">{percent}%</span>
                </div>
              </div>
              <p className="hidden md:block text-xs mt-3 text-primary-foreground/90">
                {completedCount} de {totalCount} concluídos
              </p>
            </div>

            <div className="flex-1 md:hidden min-w-0">
              <h2 className="text-base font-bold leading-tight">Olá, {firstName}!</h2>
              <p className="text-xs mt-0.5 text-primary-foreground/90 leading-snug">
                {completedCount} de {totalCount} concluídos
              </p>
            </div>

            <div className="hidden md:block">
              <h2 className="text-xl font-bold leading-tight">Olá, {firstName}!</h2>
              <p className="text-sm mt-3 text-primary-foreground/90 leading-relaxed">
                Comece pelo essencial e avance conforme os módulos liberados para sua organização.
              </p>
            </div>

            <div className="hidden md:flex flex-col space-y-2 text-sm">
              <button
                onClick={() => setOpen(false)}
                className="block underline opacity-90 hover:opacity-100 text-left"
              >
                Ver mais tarde
              </button>
              <button
                onClick={() => setConfirmingSkip(true)}
                className="block underline opacity-90 hover:opacity-100 text-left"
              >
                Pular e concluir tudo
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 rounded-full text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="hidden md:flex items-start justify-between p-5 pb-3">
              <div>
                <h3 className="text-lg font-semibold">Guia de configuração</h3>
                <p className="text-sm text-muted-foreground">
                  Passos iniciais por perfil e permissão.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-0 space-y-2">
              {steps.map((step) => {
                const Icon = ICON_MAP[step.icon] || Circle;
                const done = !!progress[step.id];

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-center gap-2.5 md:gap-3 p-2.5 rounded-lg transition-colors',
                      done ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-card hover:bg-muted/50',
                    )}
                  >
                    <div
                      className={cn(
                        'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
                        done ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary',
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className={cn(
                            'truncate text-sm font-medium leading-tight',
                            done && 'line-through text-muted-foreground',
                          )}
                        >
                          {step.title}
                        </p>
                        <span className="hidden sm:inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {step.section}
                        </span>
                      </div>
                      <p className="hidden md:block text-xs text-muted-foreground mt-0.5 truncate">
                        {step.description}
                      </p>
                    </div>

                    {!done ? (
                      <Button
                        size="sm"
                        onClick={() => handleStart(step)}
                        className="shrink-0 h-8 px-3"
                      >
                        {step.ctaLabel}
                      </Button>
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    )}

                    {!done && (
                      <button
                        onClick={() => handleToggle(step)}
                        className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 hover:border-primary shrink-0 transition-colors"
                        title="Marcar como concluído"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t mt-2 px-4 md:px-5 py-3 flex items-center gap-3 md:gap-4 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">{percent}%</span>
                </div>
                <Progress value={percent} className="h-1.5" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={restart}
                className="text-xs text-muted-foreground shrink-0 px-2"
              >
                <RotateCcw className="h-3 w-3 md:mr-1.5" />
                <span className="hidden md:inline">Reiniciar guia</span>
              </Button>
            </div>

            <div className="md:hidden border-t px-4 py-2 flex items-center justify-between text-xs shrink-0">
              <button onClick={() => setOpen(false)} className="underline text-muted-foreground">
                Ver mais tarde
              </button>
              <button onClick={() => setConfirmingSkip(true)} className="underline text-muted-foreground">
                Pular tudo
              </button>
            </div>
          </div>
        </div>

        {confirmingSkip && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="max-w-sm text-center space-y-4">
              <h3 className="text-lg font-semibold">Pular configuração?</h3>
              <p className="text-sm text-muted-foreground">
                Todos os passos serão marcados como concluídos e este guia não aparecerá mais. Você poderá
                reabri-lo manualmente quando quiser.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setConfirmingSkip(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    skipAll();
                    setConfirmingSkip(false);
                  }}
                >
                  Sim, pular tudo
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
