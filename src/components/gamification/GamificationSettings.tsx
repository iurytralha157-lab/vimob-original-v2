import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Trophy,
  Save,
  Phone,
  MessageSquare,
  UserCheck,
  Calendar,
  BadgeDollarSign,
  Loader2,
  UserPlus,
  Home,
  FileCheck,
  ClipboardCheck,
  Presentation,
  FileText,
} from 'lucide-react';

const RULE_ICONS: Record<string, any> = {
  call_made: Phone,
  message_sent: MessageSquare,
  contact_made: UserCheck,
  visit_scheduled: Calendar,
  meeting_scheduled: Calendar,
  sale_closed: BadgeDollarSign,
  lead_created: UserPlus,
  lead_created_manual: UserPlus,
  property_created: Home,
  proposal_sent: FileText,
  contract_signed: FileCheck,
  visit_confirmed: ClipboardCheck,
  meeting_held: Presentation,
};

const RULE_LABELS: Record<string, string> = {
  call_made: 'Ligação Realizada',
  message_sent: 'Mensagem Enviada',
  contact_made: 'Contato Efetivo',
  visit_scheduled: 'Visita Agendada',
  meeting_scheduled: 'Reunião Agendada',
  sale_closed: 'Venda Concluída',
  lead_created: 'Novo Lead Recebido',
  lead_created_manual: 'Cadastro Manual de Lead',
  property_created: 'Captação de Imóvel',
  proposal_sent: 'Proposta Enviada',
  contract_signed: 'Contrato Assinado',
  visit_confirmed: 'Visita Confirmada',
  meeting_held: 'Reunião Realizada',
};

const DEFAULT_RULES = Object.keys(RULE_LABELS).map(type => ({
  action_type: type,
  points: ({
    call_made: 5,
    message_sent: 2,
    contact_made: 3,
    visit_scheduled: 20,
    visit_confirmed: 35,
    meeting_scheduled: 10,
    meeting_held: 25,
    proposal_sent: 30,
    sale_closed: 500,
    contract_signed: 250,
    lead_created: 10,
    lead_created_manual: 10,
    property_created: 50,
  } as Record<string, number>)[type] ?? 10,
  is_active: true,
}));

export function GamificationSettings() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [editingRules, setEditingRules] = useState<Record<string, number>>({});

  const { data: rules, isLoading } = useQuery({
    queryKey: ['gamification-rules-admin', organization.id],
    queryFn: async () => {
      if (!organization.id) return [];
      const { data, error } = await (supabase as any)
        .from('gamification_rules')
        .select('*')
        .eq('organization_id', organization.id);

      if (error) throw error;

      const existingTypes = new Set(data.map((r: any) => r.action_type));
      const missingRules = DEFAULT_RULES.filter(dr => !existingTypes.has(dr.action_type));

      return [...(data || []), ...missingRules.map(mr => ({ ...mr, id: `temp-${mr.action_type}`, is_temp: true }))];
    },
    enabled: !!organization.id,
  });

  const updateRuleMutation = useMutation({
    mutationFn: async (rule: any) => {
      const points = editingRules[rule.id] ?? rule.points;

      if (rule.is_temp) {
        const { error } = await (supabase as any)
          .from('gamification_rules')
          .insert([{
            organization_id: organization.id,
            action_type: rule.action_type,
            points,
            is_active: true,
          }]);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('gamification_rules')
          .update({ points, is_active: rule.is_active, updated_at: new Date().toISOString() })
          .eq('id', rule.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-rules-admin'] });
      toast.success('Regra atualizada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar regra: ' + error.message);
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async (rule: any) => {
      if (rule.is_temp) {
        const { error } = await (supabase as any)
          .from('gamification_rules')
          .insert([{
            organization_id: organization.id,
            action_type: rule.action_type,
            points: rule.points,
            is_active: !rule.is_active,
          }]);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('gamification_rules')
          .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
          .eq('id', rule.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-rules-admin'] });
    },
  });

  const handlePointChange = (ruleId: string, value: string) => {
    setEditingRules(prev => ({
      ...prev,
      [ruleId]: parseInt(value) || 0,
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <CardTitle>Regras de Pontuação</CardTitle>
        </div>
        <CardDescription>
          Defina quantos pontos cada ação vale para os corretores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-3">
            {(rules as any[]).map((rule) => {
              const Icon = RULE_ICONS[rule.action_type] || Trophy;
              const isUpdating = updateRuleMutation.isPending && (updateRuleMutation.variables as any).id === rule.id;

              return (
                <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg bg-card gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h4 className="font-medium text-sm truncate">{RULE_LABELS[rule.action_type] || rule.action_type}</h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="w-16 h-8 text-sm"
                        value={editingRules[rule.id] ?? rule.points}
                        onChange={(e) => handlePointChange(rule.id, e.target.value)}
                      />
                      <span className="text-xs font-medium text-muted-foreground">pts</span>
                    </div>

                    <div className="flex items-center gap-1 border-l pl-3 h-8">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => toggleRuleMutation.mutate(rule)}
                        disabled={isUpdating}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => updateRuleMutation.mutate(rule)}
                        disabled={isUpdating || (editingRules[rule.id] === undefined && !rule.is_temp)}
                      >
                          {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
