import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logAuditAction } from "./use-audit-logs";
export interface ContractBroker {
  id: string;
  contract_id: string;
  user_id: string;
  commission_percentage: number;
  commission_value?: number;
  role?: string;
  created_at: string;
  user?: { id: string; name: string; email: string };
}

export interface Contract {
  id: string;
  organization_id: string;
  contract_number: string | null;
  contract_type: string | null;
  status: string | null;
  property_id?: string | null;
  lead_id?: string | null;
  value: number | null;
  commission_percentage: number | null;
  commission_value: number | null;
  // Novos campos adicionados na migration
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_document?: string | null;
  down_payment?: number | null;
  installments?: number | null;
  payment_conditions?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  signing_date?: string | null;
  closing_date?: string | null;
  notes?: string | null;
  attachments?: unknown;
  created_by?: string | null;
  created_at: string | null;
  updated_at: string | null;
  property?: { id: string; code: string; title: string | null } | null;
  lead?: { id: string; name: string } | null;
  brokers?: ContractBroker[];
}

async function generateContractNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  
  const { data: existing } = await (supabase as any)
    .from('contract_sequences')
    .select('last_number')
    .eq('organization_id', organizationId)
    .single();

  let nextNumber = 1;
  
  if (existing) {
    nextNumber = existing.last_number + 1;
    await (supabase as any)
      .from('contract_sequences')
      .update({ last_number: nextNumber })
      .eq('organization_id', organizationId);
  } else {
    await (supabase as any)
      .from('contract_sequences')
      .insert({ organization_id: organizationId, last_number: 1 });
  }

  return `CTR-${year}-${String(nextNumber).padStart(5, '0')}`;
}

export function useContracts(filters?: { status?: string; type?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['contracts', profile?.organization_id, filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('contracts')
        .select(`
          *,
          property:properties(id, code, title),
          lead:leads(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.type) {
        query = query.eq('contract_type', filters.type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Contract[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      if (!id) return null;

      const { data: contract, error } = await (supabase as any)
        .from('contracts')
        .select(`
          *,
          property:properties(id, code, title),
          lead:leads(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Fetch brokers separately with user info
      const { data: brokers } = await (supabase as any)
        .from('contract_brokers')
        .select('*')
        .eq('contract_id', id);

      // Fetch user details for each broker
      const brokersTyped = (brokers || []) as ContractBroker[];
      const brokersWithUsers = await Promise.all(
        brokersTyped.map(async (broker) => {
          const { data: user } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', broker.user_id)
            .single();
          return { ...broker, user };
        })
      );

      return { ...contract, brokers: brokersWithUsers } as Contract;
    },
    enabled: !!id,
  });
}

type CreateContractInput = Omit<Partial<Contract>, 'brokers'> & { 
  brokers?: { user_id: string; commission_percentage: number }[] 
};

type UpdateContractInput = Omit<Partial<Contract>, 'brokers'> & { 
  id: string;
  brokers?: { user_id: string; commission_percentage: number }[] 
};

export function useCreateContract() {
  const queryClient = useQueryClient();
  const { profile, user, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateContractInput) => {
      const { brokers, ...contractData } = data;
      const orgId = organization?.id || profile?.organization_id;
      if (!orgId) throw new Error('Organização não encontrada');
      
      const contractNumber = await generateContractNumber(orgId);

      const { data: contract, error } = await (supabase as any)
        .from('contracts')
        .insert({
          ...contractData,
          contract_number: contractNumber,
          organization_id: orgId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      const contractTyped = contract as Contract;

      // Insert brokers if provided
      if (brokers && brokers.length > 0) {
        const brokerEntries = brokers.map(b => ({
          contract_id: contractTyped.id,
          user_id: b.user_id,
          commission_percentage: b.commission_percentage,
          commission_value: (contractData.value || 0) * (b.commission_percentage / 100),
        }));

        await (supabase as any).from('contract_brokers').insert(brokerEntries);
      }

      // Audit log: contract created
      logAuditAction(
        'create',
        'contract',
        contractTyped.id,
        undefined,
        { 
          contract_number: contractNumber, 
          value: contractData.value, 
          client_name: contractData.client_name,
          contract_type: contractData.contract_type 
        },
        orgId
      ).catch(console.error);

      return contractTyped;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: "Contrato criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar contrato", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, brokers, ...data }: UpdateContractInput) => {
      // Fetch old data for audit
      const { data: oldContract } = await (supabase as any)
        .from('contracts')
        .select('contract_number, value, status, client_name')
        .eq('id', id)
        .single();

      const { data: contract, error } = await (supabase as any)
        .from('contracts')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update brokers if provided
      if (brokers) {
        await (supabase as any).from('contract_brokers').delete().eq('contract_id', id);
        
        if (brokers.length > 0) {
          const brokerEntries = brokers.map(b => ({
            contract_id: id,
            user_id: b.user_id,
            commission_percentage: b.commission_percentage,
            commission_value: (data.value || 0) * (b.commission_percentage / 100),
          }));

          await (supabase as any).from('contract_brokers').insert(brokerEntries);
        }
      }

      // Audit log: contract updated
      logAuditAction(
        'update',
        'contract',
        id,
        oldContract || undefined,
        data as Record<string, unknown>,
        contract.organization_id
      ).catch(console.error);

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract'] });
      toast({ title: "Contrato atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar contrato", description: error.message, variant: "destructive" });
    },
  });
}

export function useActivateContract() {
  const queryClient = useQueryClient();
  const { profile, user, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contractId, skipCommissions = false }: { contractId: string; skipCommissions?: boolean }) => {
      // Get contract details
      const { data: contractRaw, error: contractError } = await (supabase as any)
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (contractError) throw contractError;

      const contract = contractRaw as Contract;

      // Get brokers
      const { data: brokersRaw } = await (supabase as any)
        .from('contract_brokers')
        .select('*')
        .eq('contract_id', contractId);

      const brokers = (brokersRaw || []) as ContractBroker[];

      // Warn if no brokers and not skipping
      if (brokers.length === 0 && !skipCommissions) {
        throw new Error('NO_BROKERS');
      }

      // Update contract status
      await (supabase as any)
        .from('contracts')
        .update({ status: 'active', signing_date: new Date().toISOString().split('T')[0] })
        .eq('id', contractId);

      // Generate receivable entries
      const orgId = organization?.id || profile?.organization_id;
      const totalValue = contract.value || 0;

      // Generate receivable entries based on contract installments
      const installments = contract.installments || 1;
      const downPayment = contract.down_payment || 0;
      const remainingValue = totalValue - downPayment;
      const installmentValue = remainingValue / installments;
      
      const receivableEntries = [];
      
      // Entry for down payment if exists
      if (downPayment > 0) {
        receivableEntries.push({
          organization_id: orgId,
          contract_id: contractId,
          type: 'receivable',
          category: 'Entrada',
          description: `Entrada - Contrato ${contract.contract_number}`,
          amount: downPayment,
          due_date: new Date().toISOString().split('T')[0],
          status: 'pending',
          installment_number: 0,
          total_installments: installments,
          created_by: user?.id,
        });
      }
      
      // Entries for installments
      for (let i = 1; i <= installments; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);
        
        receivableEntries.push({
          organization_id: orgId,
          contract_id: contractId,
          type: 'receivable',
          category: 'Parcela',
          description: `Parcela ${i}/${installments} - Contrato ${contract.contract_number}`,
          amount: installmentValue,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
          installment_number: i,
          total_installments: installments,
          created_by: user?.id,
        });
      }
      
      // Insert receivable entries
      if (receivableEntries.length > 0) {
        await supabase.from('financial_entries').insert(receivableEntries as never[]);
      }

      // Generate commissions only if we have brokers
      if (brokers.length > 0) {
        const commissions = brokers.map((broker) => ({
          organization_id: orgId,
          contract_id: contractId,
          user_id: broker.user_id,
          property_id: contract.property_id,
          base_value: totalValue,
          percentage: broker.commission_percentage,
          calculated_value: totalValue * (broker.commission_percentage / 100),
          amount: totalValue * (broker.commission_percentage / 100),
          status: 'forecast',
          forecast_date: new Date().toISOString().split('T')[0],
        }));

        await (supabase as any).from('commissions').insert(commissions);
        
        // Also generate payable entry for commission payments
        const totalCommissionValue = commissions.reduce((sum, c) => sum + c.calculated_value, 0);
        if (totalCommissionValue > 0) {
          await supabase.from('financial_entries').insert({
            organization_id: orgId,
            contract_id: contractId,
            type: 'payable',
            category: 'Comissão',
            description: `Comissões - Contrato ${contract.contract_number}`,
            amount: totalCommissionValue,
            due_date: new Date().toISOString().split('T')[0],
            status: 'pending',
            created_by: user?.id,
          } as never);
        }
      }

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Contrato ativado com sucesso", description: "Lançamentos financeiros gerados." });
    },
    onError: (error: Error) => {
      if (error.message === 'NO_BROKERS') {
        // Don't show error, let the UI handle this
        throw error;
      }
      toast({ title: "Erro ao ativar contrato", description: error.message, variant: "destructive" });
    },
  });
}

export function useRegenerateCommissions() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (contractId: string) => {
      // Get contract details
      const { data: contractRaw, error: contractError } = await (supabase as any)
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (contractError) throw contractError;
      const contract = contractRaw as Contract;

      // Get brokers
      const { data: brokersRaw } = await (supabase as any)
        .from('contract_brokers')
        .select('*')
        .eq('contract_id', contractId);

      const brokers = (brokersRaw || []) as ContractBroker[];
      
      if (brokers.length === 0) {
        throw new Error('Este contrato não possui corretores vinculados. Edite o contrato e adicione corretores primeiro.');
      }

      // Delete existing commissions for this contract
      await (supabase as any)
        .from('commissions')
        .delete()
        .eq('contract_id', contractId);

      // Delete existing commission payable entry
      await supabase
        .from('financial_entries')
        .delete()
        .eq('contract_id', contractId)
        .eq('category', 'Comissão');

      const orgId = organization?.id || profile?.organization_id;
      const totalValue = contract.value || 0;

      // Generate new commissions
      const commissions = brokers.map((broker) => ({
        organization_id: orgId,
        contract_id: contractId,
        user_id: broker.user_id,
        property_id: contract.property_id,
        base_value: totalValue,
        percentage: broker.commission_percentage,
        calculated_value: totalValue * (broker.commission_percentage / 100),
        amount: totalValue * (broker.commission_percentage / 100),
        status: 'forecast',
        forecast_date: new Date().toISOString().split('T')[0],
      }));

      await (supabase as any).from('commissions').insert(commissions);

      // Generate payable entry for commission payments
      const totalCommissionValue = commissions.reduce((sum, c) => sum + c.calculated_value, 0);
      if (totalCommissionValue > 0) {
        await supabase.from('financial_entries').insert({
          organization_id: orgId,
          contract_id: contractId,
          type: 'payable',
          category: 'Comissão',
          description: `Comissões - Contrato ${contract.contract_number}`,
          amount: totalCommissionValue,
          due_date: new Date().toISOString().split('T')[0],
          status: 'pending',
        } as never);
      }

      return { commissionsCount: commissions.length, totalValue: totalCommissionValue };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ 
        title: "Comissões regeneradas", 
        description: `${data.commissionsCount} comissões criadas totalizando R$ ${data.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao regenerar comissões", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch contract data for audit before deletion
      const { data: contractData } = await (supabase as any)
        .from('contracts')
        .select('contract_number, value, client_name, organization_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Audit log: contract deleted
      if (contractData) {
        logAuditAction(
          'delete',
          'contract',
          id,
          { 
            contract_number: contractData.contract_number, 
            value: contractData.value, 
            client_name: contractData.client_name 
          },
          undefined,
          contractData.organization_id
        ).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: "Contrato excluído com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir contrato", description: error.message, variant: "destructive" });
    },
  });
}
