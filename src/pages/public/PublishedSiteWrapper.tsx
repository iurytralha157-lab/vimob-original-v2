import React, { useState, useEffect, ReactNode } from 'react';
import { useParams, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PublicSiteConfig } from '@/hooks/use-public-site';
import { PublicContext, PublicContextType } from './usePublicContext';
import { ScrollToTop } from '@/components/ScrollToTop';
import { lazy, Suspense } from 'react';

const PublicSiteLayout = lazy(() => import('./PublicSiteLayout'));
const PublicHome = lazy(() => import('./PublicHome'));
const PublicProperties = lazy(() => import('./PublicProperties'));
const PublicPropertyDetail = lazy(() => import('./PublicPropertyDetail'));
const PublicAbout = lazy(() => import('./PublicAbout'));
const PublicContact = lazy(() => import('./PublicContact'));
const PublicFavorites = lazy(() => import('./PublicFavorites'));

const PageLoader = () => null;

const BILLING_BLOCKED_STATUSES = ['suspended', 'pending_payment', 'overdue', 'past_due', 'blocked', 'cancelled'];

function isBillingBlockedStatus(status: unknown) {
  return BILLING_BLOCKED_STATUSES.includes(String(status || '').toLowerCase());
}

function PublishedSiteProvider({ children, slug }: { children: ReactNode; slug: string }) {
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const loadSiteConfig = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('organization_sites')
          .select('*, organizations(name, subscription_status, is_active)')
          .eq('subdomain', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (fetchError || !data) {
          console.error('Error loading site config:', fetchError);
          setError('Site não encontrado');
          return;
        }

        const organization = data.organizations as any;
        if (organization?.is_active === false || isBillingBlockedStatus(organization?.subscription_status)) {
          setIsBlocked(true);
          sessionStorage.removeItem(`site_slug_${slug}`);
          return;
        }

        const config = {
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
          hero_image_url: data.hero_image_url,
          hero_title: data.hero_title,
          hero_subtitle: data.hero_subtitle,
          page_banner_url: data.page_banner_url,
          logo_width: data.logo_width,
          logo_height: data.logo_height,
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
        };

        setOrganizationId(data.organization_id);
        setSiteConfig(config);

        sessionStorage.setItem(`site_slug_${slug}`, JSON.stringify({
          organization_id: data.organization_id,
          site_config: config
        }));
      } catch (err) {
        console.error('Error:', err);
        setError('Erro ao carregar site');
      } finally {
        setIsLoading(false);
      }
    };

    loadSiteConfig();
  }, [slug]);

  const contextValue: PublicContextType = {
    organizationId: organizationId || '',
    siteConfig,
    isLoading,
    error,
  };

  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D] px-6 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold mb-3">Acesso bloqueado</h1>
          <p className="text-base text-white/70">Entre em contato com o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <PublicContext.Provider value={contextValue}>
      {children}
    </PublicContext.Provider>
  );
}

export default function PublishedSiteWrapper() {
  const { slug } = useParams<{ slug: string }>();

  console.log('PublishedSiteWrapper - slug:', slug);

  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Site não encontrado</h1>
          <p className="text-gray-600">
            O endereço acessado não corresponde a nenhum site publicado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublishedSiteProvider slug={slug}>
      <PublishedSiteRoutes slug={slug} />
    </PublishedSiteProvider>
  );
}

function PublishedSiteRoutes({ slug }: { slug: string }) {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Suspense fallback={null}><PublicSiteLayout /></Suspense>}>
          <Route index element={<Suspense fallback={<PageLoader />}><PublicHome /></Suspense>} />
          <Route path="imoveis" element={<Suspense fallback={<PageLoader />}><PublicProperties /></Suspense>} />
          <Route path="imoveis/:codigo" element={<Suspense fallback={<PageLoader />}><PublicPropertyDetail /></Suspense>} />
          <Route path="imovel/:code" element={<Suspense fallback={<PageLoader />}><PublicPropertyDetail /></Suspense>} />
          <Route path="sobre" element={<Suspense fallback={<PageLoader />}><PublicAbout /></Suspense>} />
          <Route path="contato" element={<Suspense fallback={<PageLoader />}><PublicContact /></Suspense>} />
          <Route path="favoritos" element={<Suspense fallback={<PageLoader />}><PublicFavorites /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to={`/sites/${slug}`} replace />} />
      </Routes>
    </>
  );
}
