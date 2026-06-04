import { useState } from 'react';
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle,
  Loader2,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { SystemSettings, SystemSettingsValue } from '@/hooks/use-system-settings';

interface InternalCommunicationSettingsProps {
  settings: SystemSettings | null;
  onUpdate: (updates: Partial<SystemSettingsValue>) => Promise<void>;
}

export function InternalCommunicationSettings({ settings, onUpdate }: InternalCommunicationSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentComunicado, setCurrentComunicado] = useState({
    id: '',
    titulo: '',
    mensagem: '',
    data_publicacao: new Date().toISOString(),
    ativo: true
  });

  const comunicados = settings?.comunicados || [];

  const handleSaveComunicado = async () => {
    if (!currentComunicado.titulo || !currentComunicado.mensagem) {
      toast.error('Preencha o título e a mensagem.');
      return;
    }

    setSaving(true);
    try {
      let newComunicados;
      if (currentComunicado.id) {
        // Edit
        newComunicados = comunicados.map(c => c.id === currentComunicado.id ? currentComunicado : c);
      } else {
        // Add
        const newEntry = {
          ...currentComunicado,
          id: Math.random().toString(36).substring(2, 11)
        };
        newComunicados = [newEntry, ...comunicados];
      }

      await onUpdate({ comunicados: newComunicados });
      toast.success('Comunicado salvo!');
      resetForm();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este comunicado?')) return;
    
    setSaving(true);
    try {
      const newComunicados = comunicados.filter(c => c.id !== id);
      await onUpdate({ comunicados: newComunicados });
      toast.success('Comunicado excluído.');
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: string) => {
    const newComunicados = comunicados.map(c => {
      if (c.id === id) return { ...c, ativo: !c.ativo };
      return c;
    });
    await onUpdate({ comunicados: newComunicados });
    toast.success('Status atualizado.');
  };

  const resetForm = () => {
    setCurrentComunicado({
      id: '',
      titulo: '',
      mensagem: '',
      data_publicacao: new Date().toISOString(),
      ativo: true
    });
    setIsEditing(false);
  };

  const startEdit = (comunicado: any) => {
    setCurrentComunicado(comunicado);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Editar Comunicado' : 'Novo Comunicado'}</CardTitle>
          <CardDescription>
            Crie comunicados que serão exibidos para os usuários no dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input 
                value={currentComunicado.titulo} 
                onChange={(e) => setCurrentComunicado({ ...currentComunicado, titulo: e.target.value })}
                placeholder="Ex: Nova funcionalidade disponível!"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Publicação</Label>
              <Input 
                type="datetime-local"
                value={currentComunicado.data_publicacao.substring(0, 16)} 
                onChange={(e) => setCurrentComunicado({ ...currentComunicado, data_publicacao: new Date(e.target.value).toISOString() })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem (Editor de Texto)</Label>
            <Textarea 
              value={currentComunicado.mensagem} 
              onChange={(e) => setCurrentComunicado({ ...currentComunicado, mensagem: e.target.value })}
              placeholder="Descreva as novidades aqui..."
              className="min-h-[150px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              checked={currentComunicado.ativo} 
              onCheckedChange={(checked) => setCurrentComunicado({ ...currentComunicado, ativo: checked })} 
            />
            <Label>Comunicado Ativo</Label>
          </div>
          <div className="flex justify-end gap-2">
            {isEditing && (
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            )}
            <Button onClick={handleSaveComunicado} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />}
              {isEditing ? 'Atualizar Comunicado' : 'Publicar Comunicado'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comunicados Enviados</CardTitle>
          <CardDescription>Lista de todos os comunicados internos registrados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comunicados.length > 0 ? (
                comunicados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.titulo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(c.data_publicacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => toggleStatus(c.id)}>
                        {c.ativo ? (
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs">Ativo</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs">Inativo</span>
                          </div>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum comunicado encontrado.
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
