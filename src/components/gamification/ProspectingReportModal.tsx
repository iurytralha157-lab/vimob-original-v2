import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Phone, MessageSquare, UserCheck, Rocket, Home, ClipboardList, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const formSchema = z.object({
  calls: z.coerce.number().min(0).default(0),
  messages: z.coerce.number().min(0).default(0),
  scheduled_visits: z.coerce.number().min(0).default(0),
  confirmed_visits: z.coerce.number().min(0).default(0),
  meetings: z.coerce.number().min(0).default(0),
  proposals_sent: z.coerce.number().min(0).default(0),
  source: z.string().min(1, 'Selecione a origem'),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ProspectingReportModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, organization } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      calls: 0,
      messages: 0,
      scheduled_visits: 0,
      confirmed_visits: 0,
      meetings: 0,
      proposals_sent: 0,
      source: '',
      description: '',
    },
  });

  async function onSubmit(values: FormValues) {
    console.log("Submitting report with values:", values);
    if (!user || !organization) {
      console.error("Missing user or organization", { user, organization });
      toast.error("Erro de autenticação. Tente recarregar a página.");
      return;
    }

    setLoading(true);
    try {
      const dataToInsert = {
        user_id: user.id,
        organization_id: organization.id,
        calls: values.calls,
        messages: values.messages,
        scheduled_visits: values.scheduled_visits,
        confirmed_visits: values.confirmed_visits,
        meetings: values.meetings,
        proposals_sent: values.proposals_sent,
        source: values.source,
        description: values.description || null,
        metadata: {
          manual_entry: true,
          submitted_at: new Date().toISOString()
        }
      };
      
      console.log("Inserting data into Supabase:", dataToInsert);

      const { data, error } = await supabase.from('prospecting_reports').insert(dataToInsert).select();

      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }
      
      console.log("Insert success:", data);

      toast.success('Relatório de prospecção enviado! Pontos creditados.');
      // Invalidate all gamification-related queries
      queryClient.invalidateQueries({ queryKey: ['gamification-stats'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-total-points-agg'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-leaderboard-full'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-recent-activities'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-history-logs'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-performance'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-missions'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-missions-admin'] });
      setOpen(false);
      form.reset();
    } catch (error: any) {
      console.error('Final error submitting report:', error);
      toast.error('Erro ao enviar relatório: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg animate-pulse hover:animate-none">
          <Rocket className="h-4 w-4" />
          <span>Lançar Prospecção</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-orange-500" />
            Relatório de Atividade Diária
          </DialogTitle>
          <DialogDescription>
            Informe suas atividades de prospecção para ganhar pontos no ranking.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-xs text-amber-800 mb-2">
              ⚠️ Certifique-se de que os dados estão corretos antes de enviar.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="calls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <Phone className="h-3 w-3" /> Ligações
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="messages"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <MessageSquare className="h-3 w-3" /> Mensagens
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_visits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <PlusCircle className="h-3 w-3" /> Visitas Agendadas
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmed_visits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <Home className="h-3 w-3" /> Visitas Confirmadas
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="meetings"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <UserCheck className="h-3 w-3" /> Reuniões
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="proposals_sent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <Send className="h-3 w-3" /> Propostas Enviadas
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Origem da Prospecção</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a origem" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp / Grupos</SelectItem>
                      <SelectItem value="spreadsheet">Planilha de Frios</SelectItem>
                      <SelectItem value="referral">Indicação</SelectItem>
                      <SelectItem value="recontact">Recontato de Base</SelectItem>
                      <SelectItem value="canvassing">Panfletagem / PAP</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ex: Prospectando lista do bairro X"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando...' : 'Confirmar e Ganhar Pontos'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
