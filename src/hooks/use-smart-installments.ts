import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SmartInstallment {
  id: string;
  label: string; // "1/10", "2/10"
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: string;
  isLate: boolean;
  lateDays: number;
  lateFee: number | null; // multa por atraso
  canEdit: boolean;
  contractId: string;
}

const LATE_FEE_PERCENTAGE = 0.02; // 2%
const DAILY_INTEREST_RATE = 0.00033; // 0.033% ao dia

function calculateLateFee(amount: number, daysLate: number): number {
  if (daysLate <= 0) return 0;
  const penalty = amount * LATE_FEE_PERCENTAGE;
  const interest = amount * DAILY_INTEREST_RATE * daysLate;
  return Math.round((penalty + interest) * 100) / 100;
}

function getDaysLate(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - due.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

/**
 * Hook que lista parcelas de um contrato com status enriquecido
 */
export function useSmartInstallments(contractId: string | undefined) {
  return useQuery({
    queryKey: ['smart-installments', contractId],
    queryFn: async () => {
      if (!contractId) return [];

      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('contract_id', contractId)
        .eq('type', 'receivable')
        .not('installment_number', 'is', null)
        .gt('installment_number', 0)
        .order('installment_number', { ascending: true });

      if (error) throw error;

      const entries = data || [];
      
      return entries.map((entry: any): SmartInstallment => {
        const paidAmount = entry.paid_amount || entry.paid_value || 0;
        const remainingAmount = Math.max(0, entry.amount - paidAmount);
        const daysLate = entry.status !== 'paid' ? getDaysLate(entry.due_date) : 0;
        const isLate = daysLate > 0 && entry.status !== 'paid';
        const lateFee = isLate ? calculateLateFee(entry.amount, daysLate) : null;

        return {
          id: entry.id,
          label: `${entry.installment_number}/${entry.total_installments || entries.length}`,
          installmentNumber: entry.installment_number,
          totalInstallments: entry.total_installments || entries.length,
          amount: entry.amount,
          paidAmount,
          remainingAmount,
          dueDate: entry.due_date,
          status: entry.status || 'pending',
          isLate,
          lateDays: daysLate,
          lateFee,
          canEdit: entry.status !== 'paid',
          contractId: entry.contract_id,
        };
      });
    },
    enabled: !!contractId,
  });
}

/**
 * Hook para pagar parcela (total ou parcial)
 */
export function usePayInstallment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ installmentId, amount }: { installmentId: string; amount: number }) => {
      // Buscar parcela atual
      const { data: entry, error: fetchError } = await supabase
        .from('financial_entries')
        .select('amount, paid_amount, paid_value, status')
        .eq('id', installmentId)
        .single();

      if (fetchError) throw fetchError;

      const currentPaid = (entry as any).paid_amount || (entry as any).paid_value || 0;
      const newPaidAmount = currentPaid + amount;
      const totalAmount = (entry as any).amount;

      // Determinar novo status
      let newStatus = 'partial';
      let paidDate: string | null = null;
      
      if (newPaidAmount >= totalAmount) {
        newStatus = 'paid';
        paidDate = new Date().toISOString().split('T')[0];
      }

      const { error: updateError } = await supabase
        .from('financial_entries')
        .update({
          paid_amount: newPaidAmount,
          paid_value: newPaidAmount,
          status: newStatus,
          paid_date: paidDate || undefined,
        } as never)
        .eq('id', installmentId);

      if (updateError) throw updateError;

      return { newPaidAmount, newStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['smart-installments'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });

      if (data.newStatus === 'paid') {
        toast.success('Parcela paga integralmente!');
      } else {
        toast.success(`Pagamento parcial registrado - R$ ${data.newPaidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      }
    },
    onError: (error: Error) => {
      toast.error('Erro ao registrar pagamento', { description: error.message });
    },
  });
}

/**
 * Calcula tabela Price para parcelas
 */
export function calculatePriceTable(
  totalValue: number,
  downPayment: number,
  installments: number,
  monthlyInterestRate: number = 0
): { installmentValue: number; totalWithInterest: number } {
  const principal = totalValue - downPayment;

  if (monthlyInterestRate <= 0 || installments <= 0) {
    return {
      installmentValue: Math.round((principal / Math.max(installments, 1)) * 100) / 100,
      totalWithInterest: principal,
    };
  }

  // Sistema Price: PMT = PV * [i(1+i)^n] / [(1+i)^n - 1]
  const i = monthlyInterestRate / 100;
  const n = installments;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  const installmentValue = Math.round(principal * factor * 100) / 100;

  return {
    installmentValue,
    totalWithInterest: Math.round(installmentValue * installments * 100) / 100,
  };
}
