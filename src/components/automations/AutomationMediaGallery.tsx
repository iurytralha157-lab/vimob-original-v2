import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Trash2, Loader2, Image, Check, Search } from 'lucide-react';

interface AutomationMediaGalleryProps {
  onSelect: (url: string) => void;
  selectedUrl?: string;
  accept?: string; // e.g. "image/*", "audio/*", "video/*"
  mediaType?: 'image' | 'audio' | 'video';
}

export function AutomationMediaGallery({ onSelect, selectedUrl, accept = 'image/*', mediaType = 'image' }: AutomationMediaGalleryProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');

  const orgId = profile?.organization_id;
  const folder = `${orgId}/${mediaType}s`;

  const { data: files, isLoading } = useQuery({
    queryKey: ['automation-media', orgId, mediaType],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.storage
        .from('automation-media')
        .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      return (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
    },
    enabled: !!orgId,
  });

  const getPublicUrl = useCallback((fileName: string) => {
    const { data } = supabase.storage.from('automation-media').getPublicUrl(`${folder}/${fileName}`);
    return data.publicUrl;
  }, [folder]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx 10MB)');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `${folder}/${fileName}`;

      const { error } = await supabase.storage
        .from('automation-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['automation-media', orgId, mediaType] });

      const url = getPublicUrl(fileName);
      onSelect(url);
      toast.success('Arquivo enviado!');
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const { error } = await supabase.storage
        .from('automation-media')
        .remove([`${folder}/${fileName}`]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-media', orgId, mediaType] });
      toast.success('Arquivo removido');
    },
    onError: (err: any) => toast.error('Erro ao remover: ' + err.message),
  });

  const filteredFiles = files?.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const typeLabels = { image: 'imagem', audio: 'áudio', video: 'vídeo' };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs flex-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
          {uploading ? 'Enviando...' : `Enviar ${typeLabels[mediaType]}`}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {(files && files.length > 3) && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-7 text-xs pl-7"
          />
        </div>
      )}

      <ScrollArea className="max-h-[180px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Image className="h-6 w-6 mx-auto mb-1 opacity-40" />
            <p className="text-[11px]">Nenhum arquivo na galeria</p>
          </div>
        ) : (
          <div className={mediaType === 'image' ? 'grid grid-cols-3 gap-1.5' : 'space-y-1'}>
            {filteredFiles.map((file) => {
              const url = getPublicUrl(file.name);
              const isSelected = selectedUrl === url;

              if (mediaType === 'image') {
                return (
                  <div
                    key={file.name}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                      isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-primary/30'
                    }`}
                    onClick={() => onSelect(url)}
                  >
                    <img src={url} alt={file.name} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="h-5 w-5 text-primary-foreground drop-shadow-md" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(file.name); }}
                      className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={file.name}
                  className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer border transition-all ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-accent/50'
                  }`}
                  onClick={() => onSelect(url)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(0)}KB` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(file.name); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
