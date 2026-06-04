import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface OrganizationSite {
  id: string;
  organization_id: string;
  is_active: boolean;
  subdomain: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  domain_verified_at: string | null;
  site_title: string | null;
  site_description: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  linkedin: string | null;
  about_title: string | null;
  about_text: string | null;
  about_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  google_analytics_id: string | null;
  // Hero fields
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  page_banner_url: string | null;
  // Logo size fields
  logo_width: number | null;
  logo_height: number | null;
  // Watermark fields
  watermark_enabled: boolean | null;
  watermark_opacity: number | null;
  watermark_logo_url: string | null;
  watermark_size: number | null;
  watermark_position: string | null;
  // Theme fields
  site_theme: string | null;
  background_color: string | null;
  text_color: string | null;
  card_color: string | null;
  show_about_on_home: boolean | null;
  created_at: string;
  updated_at: string;
}

export function useOrganizationSite() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['organization-site', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from('organization_sites')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as OrganizationSite | null;
    },
    enabled: !!organization?.id,
  });
}

export function useCreateOrganizationSite() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<OrganizationSite>) => {
      if (!organization?.id) throw new Error('No organization');

      const { data: site, error } = await supabase
        .from('organization_sites')
        .insert({
          organization_id: organization.id,
          ...data,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return site;
    },
    onSuccess: async () => {
      // Seed default menu items
      const defaults = [
        { label: 'HOME', link_type: 'page', href: '', position: 0 },
        { label: 'IMÓVEIS', link_type: 'page', href: 'imoveis', position: 1 },
        { label: 'APARTAMENTO', link_type: 'filter', href: 'imoveis?tipo=Apartamento', position: 2 },
        { label: 'CASA', link_type: 'filter', href: 'imoveis?tipo=Casa', position: 3 },
        { label: 'SOBRE', link_type: 'page', href: 'sobre', position: 4 },
        { label: 'CONTATO', link_type: 'page', href: 'contato', position: 5 },
      ];
      await supabase.from('site_menu_items' as any).insert(
        defaults.map(d => ({ ...d, organization_id: organization!.id, open_in_new_tab: false, is_active: true }))
      );
      // Seed default search filters
      const defaultFilters = [
        { filter_key: 'search', label: 'Buscar', position: 0 },
        { filter_key: 'tipo', label: 'Tipo de Imóvel', position: 1 },
        { filter_key: 'finalidade', label: 'Finalidade', position: 2 },
      ];
      await supabase.from('site_search_filters' as any).insert(
        defaultFilters.map(f => ({ ...f, organization_id: organization!.id, is_active: true }))
      );
      queryClient.invalidateQueries({ queryKey: ['organization-site'] });
      queryClient.invalidateQueries({ queryKey: ['site-menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['site-search-filters'] });
      toast.success('Site criado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating site:', error);
      toast.error('Erro ao criar site');
    },
  });
}

export function useUpdateOrganizationSite() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<OrganizationSite>) => {
      if (!organization?.id) throw new Error('No organization');

      const { data: site, error } = await supabase
        .from('organization_sites')
        .update(data as any)
        .eq('organization_id', organization.id)
        .select()
        .single();

      if (error) throw error;
      return site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-site'] });
      toast.success('Site atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating site:', error);
      toast.error('Erro ao atualizar site');
    },
  });
}

export function useUploadSiteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'logo' | 'favicon' | 'about' | 'hero' | 'banner' | 'watermark' }) => {
      // Basic validation in hook
      const maxSize = type === 'favicon' ? 1 : 10; // 1MB for favicon, 10MB for others
      if (file.size > maxSize * 1024 * 1024) {
        throw new Error(`Arquivo muito grande. O limite é ${maxSize}MB.`);
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Tipo de arquivo não permitido: ${file.type}`);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `site-${type}-${Date.now()}.${fileExt}`;
      const filePath = `sites/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { 
          upsert: true,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-site'] });
    },
    onError: (error: any) => {
      console.error('Error uploading asset:', error);
      toast.error('Erro ao fazer upload: ' + (error.message || 'Erro desconhecido'));
    },
  });
}

