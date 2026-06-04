import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Mail, Search, AlertCircle, Send } from "lucide-react";

export default function EmailTemplates() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewVars, setPreviewVars] = useState({ nome: "João Silva", email: "joao@email.com" });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates" as any).select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (template: any) => {
      const { error } = await supabase
        .from("email_templates" as any)
        .update({
          name: template.name,
          subject: template.subject,
          html: template.html,
          is_active: template.active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template atualizado com sucesso!");
      setEditingTemplate(null);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar template: " + error.message);
    },
  });

  const sendTestEmail = useMutation({
    mutationFn: async (params: { key: string, test_recipient: string }) => {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: params.test_recipient,
          template_key: params.key,
          variables: { nome: "Usuário Teste", email: params.test_recipient }
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("E-mail de teste enviado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao enviar e-mail de teste: " + (error.message || "Verifique se a Edge Function está implantada e se a API Key do Resend foi configurada."));
    },
  });

  const renderPreview = (html: string) => {
    let preview = html;
    Object.entries(previewVars).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      preview = preview.replace(regex, value);
    });
    return preview;
  };

  if (isLoading) return <div className="p-8 text-center">Carregando templates...</div>;

  return (
    <div className="container mx-auto py-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Templates de E-mail (Resend)</h1>
          <p className="text-muted-foreground">Gerencie as comunicações transacionais enviadas via Edge Function.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open('https://resend.com', '_blank')}>
            Ir para Resend
          </Button>
        </div>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Configuração Necessária</p>
            <p>Certifique-se de que a variável de ambiente <code>RESEND_API_KEY</code> está configurada no seu projeto Supabase para que os envios funcionem.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chave</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map((template: any) => (
                <TableRow key={template.id}>
                  <TableCell className="font-mono text-xs">{template.key}</TableCell>
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell>{template.subject}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${template.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {template.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Enviar Teste"
                      onClick={() => {
                        const email = prompt("Para qual e-mail deseja enviar o teste?", "seuemail@exemplo.com");
                        if (email) {
                          sendTestEmail.mutate({ key: template.key, test_recipient: email });
                        }
                      }}
                      disabled={sendTestEmail.isPending}
                    >
                      <Send className={`h-4 w-4 ${sendTestEmail.isPending ? 'animate-pulse' : ''}`} />
                    </Button>
                    <Dialog open={editingTemplate?.id === template.id} onOpenChange={(open) => !open && setEditingTemplate(null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setEditingTemplate({ ...template })}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Template: {template.name}</DialogTitle>
                        </DialogHeader>
                        {editingTemplate && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Nome</label>
                                <Input 
                                  value={editingTemplate.name} 
                                  onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Assunto</label>
                                <Input 
                                  value={editingTemplate.subject} 
                                  onChange={(e) => setEditingTemplate({...editingTemplate, subject: e.target.value})}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">HTML (Corpo do Email)</label>
                                <Textarea 
                                  className="font-mono h-[300px]"
                                  value={editingTemplate.html} 
                                  onChange={(e) => setEditingTemplate({...editingTemplate, html: e.target.value})}
                                />
                              </div>
                              <Button 
                                className="w-full" 
                                onClick={() => updateTemplate.mutate(editingTemplate)}
                                disabled={updateTemplate.isPending}
                              >
                                {updateTemplate.isPending ? "Salvando..." : "Salvar Alterações"}
                              </Button>
                            </div>
                            
                            <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                              <h3 className="font-medium border-b pb-2">Preview</h3>
                              <div className="bg-white border p-4 rounded min-h-[400px]">
                                <p className="text-xs text-muted-foreground mb-4">Assunto: {editingTemplate.subject}</p>
                                <div dangerouslySetInnerHTML={{ __html: renderPreview(editingTemplate.html) }} />
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                <p>* Variáveis disponíveis para teste: {"{{nome}}" }, {"{{email}}" }</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {templates?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum template encontrado. Execute o SQL de migração.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
