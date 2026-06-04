import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Copy, RefreshCw, ExternalLink, ShieldCheck, Key, AlertTriangle } from 'lucide-react';

export function APITab() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('organization_api_keys' as any)
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!profile?.organization_id,
  });

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.organization_id) throw new Error('No organization found');
      // Geração 100% server-side via RPC SECURITY DEFINER.
      // O banco gera a chave, salva apenas o hash SHA-256 e retorna a chave em texto UMA ÚNICA VEZ.
      const { data, error } = await supabase.rpc('generate_organization_api_key' as any, {
        p_name: keyName || 'Chave Padrão',
        p_organization_id: profile.organization_id,
      });
      if (error) throw error;
      const apiKey = typeof data === 'string' ? data : (Array.isArray(data) ? data[0]?.api_key : data?.api_key);
      if (!apiKey) throw new Error('Resposta inválida da geração de chave');
      return apiKey as string;
    },
    onSuccess: (apiKey) => {
      setNewKey(apiKey);
      setKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('Chave de API gerada com sucesso!');
    },
    onError: (error: any) => {
      console.error('Error generating API key:', error);
      toast.error(error?.message || 'Erro ao gerar chave de API');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('organization_api_keys' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('Chave de API removida');
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Banner de segurança */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Mantenha sua chave em segredo</p>
            <p className="text-muted-foreground">
              A chave dá acesso aos imóveis desta organização. Nunca a coloque no frontend
              público (HTML, JS do navegador, repositórios públicos). Use sempre a partir
              do seu backend.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Chaves de API
              </CardTitle>
              <CardDescription>
                Use estas chaves para autenticar suas requisições na API pública e puxar
                os imóveis cadastrados nesta organização.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 space-y-1.5 w-full">
              <Label htmlFor="key-name">Apelido da chave (opcional)</Label>
              <Input
                id="key-name"
                placeholder="Ex.: Site institucional"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={80}
              />
            </div>
            <Button
              onClick={() => generateKeyMutation.mutate()}
              disabled={generateKeyMutation.isPending}
            >
              {generateKeyMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Key className="h-4 w-4 mr-2" />
              )}
              Gerar Nova Chave
            </Button>
          </div>

          {newKey && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-primary font-medium">
                <ShieldCheck className="h-4 w-4" />
                Sua nova chave de API
              </div>
              <p className="text-sm text-muted-foreground">
                Esta é a <strong>única vez</strong> que você verá a chave completa. Copie e
                guarde em local seguro agora — depois só restará o prefixo identificador.
              </p>
              <div className="flex gap-2">
                <Input value={newKey} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(newKey)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewKey(null)}>
                Já salvei, ocultar
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {isLoading ? (
              <div className="h-20 flex items-center justify-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Carregando chaves...
              </div>
            ) : apiKeys?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                Nenhuma chave de API gerada.
              </div>
            ) : (
              apiKeys?.map((key: any) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-card"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{key.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {key.key_prefix}…
                      </code>
                      <span className="text-xs text-muted-foreground">
                        Criada em {new Date(key.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      {key.last_used_at && (
                        <span className="text-xs text-muted-foreground">
                          • Último uso{' '}
                          {new Date(key.last_used_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`Remover a chave "${key.name}"? Sistemas que a usam pararão de funcionar imediatamente.`)) {
                        deleteKeyMutation.mutate(key.id);
                      }
                    }}
                  >
                    Remover
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documentação da API</CardTitle>
          <CardDescription>
            Aprenda como integrar seus imóveis em sites e outros sistemas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
            <div className="space-y-1">
              <p className="font-medium">Guia de Integração</p>
              <p className="text-sm text-muted-foreground">
                Endpoints, parâmetros, exemplos em curl/JavaScript e formato de resposta.
              </p>
            </div>
            <Button variant="outline" asChild>
              <a href="/docs/api" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver Documentação
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
