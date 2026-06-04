import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  content: string;
  video_url: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useHelpArticles() {
  const queryClient = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['help-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .order('category')
        .order('display_order');

      if (error) throw error;
      return data as HelpArticle[];
    },
  });

  const { data: activeArticles } = useQuery({
    queryKey: ['help-articles-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('display_order');

      if (error) throw error;
      return data as HelpArticle[];
    },
  });

  const createArticle = useMutation({
    mutationFn: async (article: Omit<HelpArticle, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('help_articles')
        .insert(article)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Artigo criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      queryClient.invalidateQueries({ queryKey: ['help-articles-active'] });
    },
    onError: (error) => {
      toast.error('Erro ao criar artigo: ' + error.message);
    },
  });

  const updateArticle = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<HelpArticle> & { id: string }) => {
      const { error } = await supabase
        .from('help_articles')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Artigo atualizado!');
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      queryClient.invalidateQueries({ queryKey: ['help-articles-active'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar artigo: ' + error.message);
    },
  });

  const deleteArticle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('help_articles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Artigo excluído!');
      queryClient.invalidateQueries({ queryKey: ['help-articles'] });
      queryClient.invalidateQueries({ queryKey: ['help-articles-active'] });
    },
    onError: (error) => {
      toast.error('Erro ao excluir artigo: ' + error.message);
    },
  });

  // Group articles by category
  const articlesByCategory = articles?.reduce((acc, article) => {
    if (!acc[article.category]) {
      acc[article.category] = [];
    }
    acc[article.category].push(article);
    return acc;
  }, {} as Record<string, HelpArticle[]>);

  return {
    articles,
    activeArticles,
    articlesByCategory,
    isLoading,
    createArticle,
    updateArticle,
    deleteArticle,
  };
}
