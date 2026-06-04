import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface VerifyDomainResult {
  domain: string;
  verified: boolean;
  records: Array<{
    type: string;
    name: string;
    data: string;
    TTL?: number;
  }>;
  expected_ip: string;
  error?: string;
}

export function useVerifyDomain() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (domain: string): Promise<VerifyDomainResult> => {
      const { data, error } = await supabase.functions.invoke('verify-domain-dns', {
        body: { 
          domain, 
          organization_id: organization?.id 
        }
      });

      if (error) throw error;
      return data as VerifyDomainResult;
    },
    onSuccess: (data) => {
      if (data.verified) {
        toast.success('Domínio verificado com sucesso!');
        queryClient.invalidateQueries({ queryKey: ['organization-site'] });
      }
    },
    onError: (error) => {
      console.error('Error verifying domain:', error);
      toast.error('Erro ao verificar domínio');
    },
  });
}
