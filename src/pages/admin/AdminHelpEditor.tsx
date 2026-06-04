import { useState } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2,
  HelpCircle,
  Video,
  Image,
  GripVertical,
  Eye,
  EyeOff,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useHelpArticles, HelpArticle } from '@/hooks/use-help-articles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const CATEGORIES = [
  { value: 'primeiros-passos', label: 'Primeiros Passos' },
  { value: 'leads', label: 'Leads e CRM' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'automacoes', label: 'Automações' },
  { value: 'integrações', label: 'Integrações' },
  { value: 'configurações', label: 'Configurações' },
  { value: 'faq', label: 'Perguntas Frequentes' },
];

const initialFormData = {
  category: 'primeiros-passos',
  title: '',
  content: '',
  video_url: '',
  image_url: '',
  display_order: 0,
  is_active: true,
};

export default function AdminHelpEditor() {
  const { articles, articlesByCategory, isLoading, createArticle, updateArticle, deleteArticle } = useHelpArticles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<HelpArticle | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const handleOpenDialog = (article?: HelpArticle) => {
    if (article) {
      setEditingArticle(article);
      setFormData({
        category: article.category,
        title: article.title,
        content: article.content,
        video_url: article.video_url || '',
        image_url: article.image_url || '',
        display_order: article.display_order,
        is_active: article.is_active,
      });
    } else {
      setEditingArticle(null);
      setFormData(initialFormData);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const data = {
      ...formData,
      video_url: formData.video_url || null,
      image_url: formData.image_url || null,
    };

    if (editingArticle) {
      await updateArticle.mutateAsync({ id: editingArticle.id, ...data });
    } else {
      await createArticle.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (articleToDelete) {
      await deleteArticle.mutateAsync(articleToDelete);
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
    }
  };

  const handleToggleActive = async (article: HelpArticle) => {
    await updateArticle.mutateAsync({ 
      id: article.id, 
      is_active: !article.is_active 
    });
  };

  return (
    <AdminLayout title="Central de Ajuda">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <p className="text-muted-foreground">
              Gerencie os artigos e tutoriais da página de ajuda.
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Artigo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="px-4 md:px-6 pt-6">
              <div className="text-2xl font-bold">{articles?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Total de artigos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 md:px-6 pt-6">
              <div className="text-2xl font-bold">
                {articles?.filter(a => a.is_active).length || 0}
              </div>
              <p className="text-sm text-muted-foreground">Artigos ativos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 md:px-6 pt-6">
              <div className="text-2xl font-bold">
                {articles?.filter(a => a.video_url).length || 0}
              </div>
              <p className="text-sm text-muted-foreground">Com vídeo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 md:px-6 pt-6">
              <div className="text-2xl font-bold">
                {Object.keys(articlesByCategory || {}).length}
              </div>
              <p className="text-sm text-muted-foreground">Categorias</p>
            </CardContent>
          </Card>
        </div>

        {/* Articles by Category */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Carregando artigos...
          </div>
        ) : !articles?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum artigo cadastrado.</p>
              <Button onClick={() => handleOpenDialog()} className="mt-4">
                Criar primeiro artigo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Artigos por Categoria</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6 pb-4">
              <Accordion type="multiple" className="space-y-2">
                {CATEGORIES.map((category) => {
                  const categoryArticles = articlesByCategory?.[category.value] || [];
                  if (categoryArticles.length === 0) return null;

                  return (
                    <AccordionItem key={category.value} value={category.value} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{category.label}</span>
                          <Badge variant="secondary">{categoryArticles.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {categoryArticles.map((article) => (
                            <div 
                              key={article.id}
                              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center gap-3">
                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                <div>
                                  <p className="font-medium">{article.title}</p>
                                  <div className="flex gap-2 mt-1">
                                    {!article.is_active && (
                                      <Badge variant="outline" className="text-xs">Inativo</Badge>
                                    )}
                                    {article.video_url && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Video className="h-3 w-3 mr-1" />
                                        Vídeo
                                      </Badge>
                                    )}
                                    {article.image_url && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Image className="h-3 w-3 mr-1" />
                                        Imagem
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleActive(article)}
                                >
                                  {article.is_active ? (
                                    <Eye className="h-4 w-4" />
                                  ) : (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDialog(article)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  onClick={() => {
                                    setArticleToDelete(article.id);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[90%] sm:max-w-2xl sm:w-full rounded-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArticle ? 'Editar Artigo' : 'Novo Artigo'}
              </DialogTitle>
              <DialogDescription>
                Crie ou edite um artigo de ajuda. Suporta Markdown para formatação.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Ordem de Exibição</Label>
                  <Input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Como criar meu primeiro lead?"
                />
              </div>

              <div className="space-y-2">
                <Label>Conteúdo * (Markdown suportado)</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Escreva o conteúdo do artigo aqui...

Use **negrito**, *itálico*, e listas:
- Item 1
- Item 2

## Subtítulos também funcionam"
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>URL do Vídeo (YouTube/Vimeo)</Label>
                  <Input
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>URL da Imagem</Label>
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Artigo ativo (visível na página de ajuda)</Label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="w-[40%] rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                className="w-[60%] rounded-xl"
                onClick={handleSave}
                disabled={!formData.title || !formData.content || createArticle.isPending || updateArticle.isPending}
              >
                {createArticle.isPending || updateArticle.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Artigo</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este artigo? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
