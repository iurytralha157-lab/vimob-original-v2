import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { LoadingButton } from '@/components/ui/loading-button';
import { Building2, Palette, Users, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEGMENTS = [
  { value: 'imobiliario', label: 'Imobiliário' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'outros', label: 'Outros' },
];

const ACCENT_COLORS = [
  { value: 'orange', label: 'Laranja', class: 'bg-orange-500' },
  { value: 'amber', label: 'Âmbar', class: 'bg-amber-500' },
  { value: 'blue', label: 'Azul', class: 'bg-blue-500' },
  { value: 'purple', label: 'Roxo', class: 'bg-purple-500' },
  { value: 'pink', label: 'Rosa', class: 'bg-pink-500' },
  { value: 'red', label: 'Vermelho', class: 'bg-red-500' },
];

interface WizardData {
  organizationName: string;
  segment: string;
  accentColor: string;
  teamSize: string;
}

interface Props {
  onComplete: (data: WizardData) => Promise<void>;
  isLoading: boolean;
}

const steps = [
  { id: 1, title: 'Empresa', icon: Building2 },
  { id: 2, title: 'Personalização', icon: Palette },
  { id: 3, title: 'Configuração', icon: Users },
  { id: 4, title: 'Pronto!', icon: CheckCircle2 },
];

export function OnboardingWizard({ onComplete, isLoading }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    organizationName: '',
    segment: 'imobiliario',
    accentColor: 'blue',
    teamSize: '1-5',
  });

  const progress = (currentStep / steps.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return data.organizationName.trim().length >= 2;
      case 2:
        return data.segment && data.accentColor;
      case 3:
        return data.teamSize;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      await onComplete(data);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between mt-4">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            
            return (
              <div 
                key={step.id} 
                className={cn(
                  "flex flex-col items-center gap-2 transition-colors",
                  isActive && "text-primary",
                  isComplete && "text-primary",
                  !isActive && !isComplete && "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  isActive && "border-primary bg-primary text-primary-foreground",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  !isActive && !isComplete && "border-muted-foreground/30"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium hidden sm:block">{step.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle>
            {currentStep === 1 && 'Informações da Empresa'}
            {currentStep === 2 && 'Personalize sua Experiência'}
            {currentStep === 3 && 'Configurações Finais'}
            {currentStep === 4 && 'Tudo Pronto!'}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 && 'Vamos começar com os dados básicos'}
            {currentStep === 2 && 'Escolha cores e tema que combinam com sua marca'}
            {currentStep === 3 && 'Últimos ajustes antes de começar'}
            {currentStep === 4 && 'Sua conta está configurada e pronta para uso'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Company Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nome da Empresa *</Label>
                <Input
                  id="orgName"
                  placeholder="Digite o nome da sua empresa"
                  value={data.organizationName}
                  onChange={(e) => setData({ ...data, organizationName: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment">Segmento de Atuação</Label>
                <Select 
                  value={data.segment} 
                  onValueChange={(v) => setData({ ...data, segment: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o segmento" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENTS.map(seg => (
                      <SelectItem key={seg.value} value={seg.value}>
                        {seg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Personalization */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Cor de Destaque</Label>
                <div className="flex flex-wrap gap-3">
                  {ACCENT_COLORS.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setData({ ...data, accentColor: color.value })}
                      className={cn(
                        "w-12 h-12 rounded-lg transition-all",
                        color.class,
                        data.accentColor === color.value 
                          ? "ring-2 ring-offset-2 ring-primary scale-110" 
                          : "hover:scale-105"
                      )}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tamanho da Equipe</Label>
                <Select 
                  value={data.teamSize} 
                  onValueChange={(v) => setData({ ...data, teamSize: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1-5 pessoas</SelectItem>
                    <SelectItem value="6-20">6-20 pessoas</SelectItem>
                    <SelectItem value="21-50">21-50 pessoas</SelectItem>
                    <SelectItem value="50+">Mais de 50 pessoas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">O que será criado:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ Pipeline de vendas padrão com 8 estágios</li>
                  <li>✓ Configurações de tema personalizadas</li>
                  <li>✓ Conta de administrador ativa</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/20 mb-6">
                <CheckCircle2 className="h-10 w-10 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Configuração Concluída!</h3>
              <p className="text-muted-foreground mb-6">
                Sua empresa "{data.organizationName}" está pronta para começar.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button 
              variant="outline" 
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            
            {currentStep < 4 ? (
              <Button 
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Próximo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <LoadingButton
                loading={isLoading}
                onClick={handleNext}
              >
                Começar a Usar
                <ArrowRight className="h-4 w-4 ml-2" />
              </LoadingButton>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
