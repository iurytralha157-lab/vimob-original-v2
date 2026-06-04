import React, { useState, useEffect, ReactNode } from 'react';
import { useSearchParams, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PublicSiteConfig } from '@/hooks/use-public-site';
import { PublicContext, PublicContextType } from './usePublicContext';
import { ScrollToTop } from '@/components/ScrollToTop';
import PublicSiteLayout from './PublicSiteLayout';
import PublicHome from './PublicHome';
import PublicProperties from './PublicProperties';
import PublicPropertyDetail from './PublicPropertyDetail';
import PublicAbout from './PublicAbout';
import PublicContact from './PublicContact';
import PublicFavorites from './PublicFavorites';


function PreviewSiteProvider({ children, organizationId }: { children: ReactNode; organizationId: string }) {
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSiteConfig = async () => {
      try {
        console.log('Loading site config for org:', organizationId);
        
        const { data, error: fetchError } = await supabase
          .from('organization_sites')
          .select('*, organizations(name)')
          .eq('organization_id', organizationId)
          .single();

        if (fetchError) {
          console.error('Error loading site config:', fetchError);
          setError('Erro ao carregar configuração do site');
          setIsLoading(false);
          return;
        }

        console.log('Site config loaded:', data);

        if (data) {
          setSiteConfig({
            id: data.id,
            is_active: data.is_active ?? true,
            subdomain: data.subdomain,
            custom_domain: data.custom_domain,
            site_title: data.site_title || 'Site Imobiliário',
            site_description: data.site_description,
            primary_color: data.primary_color || '#F97316',
            secondary_color: data.secondary_color || '#1E293B',
            accent_color: data.accent_color || '#F97316',
            logo_url: data.logo_url,
            favicon_url: data.favicon_url,
            email: data.email,
            phone: data.phone,
            whatsapp: data.whatsapp,
            address: data.address,
            city: data.city,
            state: data.state,
            facebook: data.facebook,
            instagram: data.instagram,
            linkedin: data.linkedin,
            youtube: data.youtube,
            about_title: data.about_title,
            about_text: data.about_text,
            about_image_url: data.about_image_url,
            seo_title: data.seo_title,
            seo_description: data.seo_description,
            seo_keywords: data.seo_keywords,
            google_analytics_id: data.google_analytics_id,
            // Hero fields
            hero_image_url: data.hero_image_url,
            hero_title: data.hero_title,
            hero_subtitle: data.hero_subtitle,
            page_banner_url: data.page_banner_url,
            // Logo size fields
            logo_width: data.logo_width,
            logo_height: data.logo_height,
            // Watermark fields
            watermark_enabled: data.watermark_enabled,
            watermark_opacity: data.watermark_opacity,
            watermark_logo_url: data.watermark_logo_url,
            watermark_size: (data as any).watermark_size ?? 80,
            watermark_position: (data as any).watermark_position ?? 'bottom-right',
            organization_name: (data.organizations as any)?.name || 'Imobiliária',
            site_theme: (data as any).site_theme || 'dark',
            background_color: (data as any).background_color || '#0D0D0D',
            text_color: (data as any).text_color || '#FFFFFF',
            card_color: (data as any).card_color || '#FFFFFF',
            show_about_on_home: (data as any).show_about_on_home ?? false,
            about_subtitle: (data as any).about_subtitle || null,
            about_stats: (data as any).about_stats || null,
            about_checkmarks: (data as any).about_checkmarks || null,
            about_features: (data as any).about_features || null,
            gtm_id: (data as any).gtm_id || null,
            meta_pixel_id: (data as any).meta_pixel_id || null,
            google_ads_id: (data as any).google_ads_id || null,
            head_scripts: (data as any).head_scripts || null,
            body_scripts: (data as any).body_scripts || null,
          });
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Erro ao carregar site');
      } finally {
        setIsLoading(false);
      }
    };

    loadSiteConfig();
  }, [organizationId]);

  const contextValue: PublicContextType = {
    organizationId,
    siteConfig,
    isLoading,
    error,
  };

  return (
    <PublicContext.Provider value={contextValue}>
      {children}
    </PublicContext.Provider>
  );
}

export default function PreviewSiteWrapper() {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get('org');

  console.log('PreviewSiteWrapper - orgId:', orgId);

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Preview do Site Público</h1>
          <p className="text-gray-600 mb-6">
            Para visualizar o site, adicione o parâmetro <code className="bg-gray-100 px-2 py-1 rounded">?org=ID_DA_ORGANIZACAO</code> na URL.
          </p>
          <p className="text-sm text-gray-500">
            Você pode encontrar o ID da organização nas configurações do CRM.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PreviewSiteProvider organizationId={orgId}>
      <PreviewSiteRoutes />
    </PreviewSiteProvider>
  );
}

function PreviewSiteRoutes() {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get('org');
  
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<PublicSiteLayout />}>
        <Route index element={<PublicHome />} />
        <Route path="imoveis" element={<PublicProperties />} />
        <Route path="imoveis/:codigo" element={<PublicPropertyDetail />} />
        <Route path="imovel/:code" element={<PublicPropertyDetail />} />
        <Route path="sobre" element={<PublicAbout />} />
        <Route path="contato" element={<PublicContact />} />
        <Route path="favoritos" element={<PublicFavorites />} />
        
      </Route>
        <Route path="*" element={<Navigate to={`/site/preview?org=${orgId}`} replace />} />
      </Routes>
    </>
  );
}
