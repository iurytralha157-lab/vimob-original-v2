import { Outlet, Link, useLocation } from "react-router-dom";
import { trackPageView } from "@/hooks/use-site-analytics";
import { Phone, Mail, MapPin, Instagram, Facebook, Youtube, Linkedin, Menu, MessageCircle, Heart } from "lucide-react";
import { usePublicFavorites } from "@/hooks/use-public-favorites";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { usePublicContext } from "./usePublicContext";

import { ContactFormDialog } from "@/components/public/ContactFormDialog";
import { usePublicSiteMenu } from "@/hooks/use-public-site-menu";
import { CookieConsent } from "@/components/public/CookieConsent";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicSiteLayout() {
  const { organizationId, siteConfig, isLoading, error } = usePublicContext();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { count: favCount } = usePublicFavorites(organizationId);
  const location = useLocation();

  // Fetch dynamic menu items (must be before early returns)
  const { data: dynamicMenuItems = [] } = usePublicSiteMenu(organizationId);

  // Get colors from config with fallbacks
  const primaryColor = siteConfig?.primary_color || '#C4A052';
  const secondaryColor = siteConfig?.secondary_color || '#0D0D0D';
  const backgroundColor = siteConfig?.background_color || '#0D0D0D';
  const textColor = siteConfig?.text_color || '#FFFFFF';
  const isDarkTheme = siteConfig?.site_theme !== 'light';

  // Dynamic document title, favicon, OG meta & hero preload based on site config
  useEffect(() => {
    if (!siteConfig) return;

    const originalTitle = document.title;
    const originalFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href;

    // Update title - handle potential double "Imóveis" or similar redundancy
    const displayTitle = siteConfig?.seo_title || siteConfig?.site_title || 'Portal Imobiliário';
    
    // Clean up title to avoid "Nexo Imóveis Imóveis" if it happens via concatenation or bad data
    // We check if the organization name is already in the title and clean it up if needed
    if (siteConfig?.organization_name && displayTitle.includes(siteConfig?.organization_name)) {
      // If title is "Nexo Imóveis Imóveis" and org is "Nexo Imóveis", it might be better to just use one
      // But for now we trust the seo_title unless it's obviously broken.
    }
    
    document.title = displayTitle;

    // Update meta description
    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const descContent = siteConfig?.seo_description || siteConfig?.site_description || '';
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = descContent;

    // Update favicon
    const favUrl = siteConfig?.favicon_url || siteConfig?.logo_url;
    if (favUrl) {
      let faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = favUrl;
    }

    // Preload hero image for LCP optimization
    if (siteConfig?.hero_image_url) {
      const existingPreload = document.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"][data-hero]');
      if (!existingPreload) {
        const preload = document.createElement('link');
        preload.rel = 'preload';
        preload.as = 'image';
        preload.href = siteConfig?.hero_image_url;
        preload.setAttribute('fetchpriority', 'high');
        preload.setAttribute('data-hero', 'true');
        document.head.appendChild(preload);
      }
    }

    // Update OG meta tags so shared links show client's info
    const ogTitle = siteConfig?.seo_title || siteConfig?.site_title || '';
    const ogDescription = siteConfig?.seo_description || siteConfig?.site_description || '';
    const ogImage = siteConfig?.logo_url || siteConfig?.favicon_url || '';

    const metaUpdates: Record<string, string> = {
      'meta[property="og:title"]': ogTitle,
      'meta[name="twitter:title"]': ogTitle,
      'meta[property="og:description"]': ogDescription,
      'meta[name="twitter:description"]': ogDescription,
      'meta[property="og:image"]': ogImage,
      'meta[name="twitter:image"]': ogImage,
    };

    const originalMeta: Record<string, string | null> = {};
    for (const [selector, value] of Object.entries(metaUpdates)) {
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        const attrMatch = selector.match(/\[(\w+)="([^"]+)"\]/);
        if (attrMatch) el.setAttribute(attrMatch[1], attrMatch[2]);
        document.head.appendChild(el);
      }
      originalMeta[selector] = el.getAttribute('content');
      if (value) el.setAttribute('content', value);
    }

    // Update OG URL
    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', window.location.href);

    return () => {
      document.title = originalTitle;
      if (originalFavicon) {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = originalFavicon;
      }
      // Remove hero preload
      document.querySelector('link[data-hero]')?.remove();
      // Restore original meta tags
      for (const [selector, value] of Object.entries(originalMeta)) {
        const el = document.querySelector<HTMLMetaElement>(selector);
        if (el && value !== null) el.setAttribute('content', value);
      }
    };
  }, [siteConfig]);

  // Inject GTM, Meta Pixel, Google Ads, and custom scripts
  useEffect(() => {
    if (!siteConfig) return;
    const injectedElements: HTMLElement[] = [];

    const injectScript = (code: string, target: 'head' | 'body') => {
      const container = target === 'head' ? document.head : document.body;
      const temp = document.createElement('div');
      temp.innerHTML = code;
      const nodes = Array.from(temp.childNodes);
      for (const node of nodes) {
        if (node instanceof HTMLScriptElement) {
          const script = document.createElement('script');
          for (const attr of Array.from(node.attributes)) {
            script.setAttribute(attr.name, attr.value);
          }
          script.textContent = node.textContent;
          container.appendChild(script);
          injectedElements.push(script);
        } else if (node instanceof HTMLElement) {
          container.appendChild(node.cloneNode(true));
          injectedElements.push(container.lastElementChild as HTMLElement);
        }
      }
    };

    const gtmId = siteConfig?.gtm_id || (siteConfig as any)?.gtm_id;
    if (gtmId) {
      const gtmScript = document.createElement('script');
      gtmScript.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`;
      document.head.appendChild(gtmScript);
      injectedElements.push(gtmScript);
      const noscript = document.createElement('noscript');
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
      iframe.height = '0';
      iframe.width = '0';
      iframe.style.display = 'none';
      iframe.style.visibility = 'hidden';
      noscript.appendChild(iframe);
      document.body.prepend(noscript);
      injectedElements.push(noscript);
    }

    const pixelId = siteConfig?.meta_pixel_id || (siteConfig as any)?.meta_pixel_id;
    if (pixelId) {
      const pixelScript = document.createElement('script');
      pixelScript.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`;
      document.head.appendChild(pixelScript);
      injectedElements.push(pixelScript);
    }

    const gadsId = siteConfig?.google_ads_id || (siteConfig as any)?.google_ads_id;
    if (gadsId) {
      const gadsScript = document.createElement('script');
      gadsScript.async = true;
      gadsScript.src = `https://www.googletagmanager.com/gtag/js?id=${gadsId}`;
      document.head.appendChild(gadsScript);
      injectedElements.push(gadsScript);
      const gadsInit = document.createElement('script');
      gadsInit.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gadsId}');`;
      document.head.appendChild(gadsInit);
      injectedElements.push(gadsInit);
    }

    const headScripts = siteConfig?.head_scripts || (siteConfig as any)?.head_scripts;
    if (headScripts) injectScript(headScripts, 'head');

    const bodyScripts = siteConfig?.body_scripts || (siteConfig as any)?.body_scripts;
    if (bodyScripts) injectScript(bodyScripts, 'body');

    return () => {
      for (const el of injectedElements) {
        try {
          el.parentNode?.removeChild(el);
        } catch {
          // Element may have been moved/removed by injected scripts (e.g. GTM)
        }
      }
    };
  }, [siteConfig]);

  // Close mobile menu on route change (scroll handled by ScrollToTop component)
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Track page views (extract propertyId from route if on property detail page)
  useEffect(() => {
    console.log('[PublicSiteLayout] Tracking check - organizationId:', organizationId, 'path:', location.pathname);
    if (!organizationId) {
      console.warn('[PublicSiteLayout] No organizationId available, skipping tracking');
      return;
    }
    const params = new URLSearchParams(location.search);

    // Try to extract property code from route patterns like /imovel/:code or /imoveis/:codigo
    // The actual property_id resolution happens server-side; we pass what we can
    trackPageView({
      organizationId,
      pagePath: location.pathname,
      referrer: document.referrer,
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
    });
  }, [location.pathname, organizationId]);

  // Use dynamic menu if configured, otherwise fallback to defaults
  const hasDynamicMenu = dynamicMenuItems.length > 0;
  
  const allNavItems = useMemo(() => {
    if (!hasDynamicMenu) return null;
    return dynamicMenuItems.map(item => ({
      href: item.href,
      label: item.label,
      link_type: item.link_type,
      open_in_new_tab: item.open_in_new_tab,
    }));
  }, [dynamicMenuItems, hasDynamicMenu]);

  // Helper function for footer link clicks
  const handleFooterClick = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // We don't block the layout with a spinner anymore.
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#0D0D0D', color: '#FFFFFF' }}>
        <h1 className="text-2xl font-bold mb-2">Site não encontrado</h1>
        <p style={{ opacity: 0.6 }}>{error || 'Verifique o endereço e tente novamente.'}</p>
      </div>
    );
  }

  const isPreviewMode = location.pathname.includes('/site/preview') || location.pathname.includes('/site/previsualização');
  const orgParam = new URLSearchParams(location.search).get('org');

  const isActive = (path: string) => {
    const currentPath = location.pathname.replace('/site/preview', '').replace('/site/previsualização', '');
    if (path === "") return currentPath === "" || currentPath === "/";
    return currentPath.includes(`/${path}`);
  };

  // Check if a filter link is active based on query params
  const isFilterActive = (href: string) => {
    const urlParams = new URLSearchParams(location.search);
    const currentPath = location.pathname.replace('/site/preview', '').replace('/site/previsualização', '');
    
    // Only highlight if we're on the properties page
    if (!currentPath.includes('/imoveis')) return false;
    
    if (href.includes('tipo=Apartamento')) return urlParams.get('tipo') === 'Apartamento';
    if (href.includes('tipo=Casa')) return urlParams.get('tipo') === 'Casa';
    if (href.includes('finalidade=aluguel')) return urlParams.get('finalidade') === 'aluguel';
    return false;
  };

  const getHref = (path: string) => {
    if (isPreviewMode && orgParam) {
      if (path.includes('?')) {
        return `/site/preview/${path}&org=${orgParam}`;
      }
      return `/site/preview/${path}?org=${orgParam}`;
    }
    const siteMatch = location.pathname.match(/^\/sites\/([^/]+)/);
    if (siteMatch) {
      return `/sites/${siteMatch[1]}/${path}`;
    }
    return `/${path}`;
  };

  // Dynamic nav links with property types and pre-applied filters
  const defaultMainNavLinks = [
    { href: "", label: "HOME" },
    { href: "imoveis", label: "IMÓVEIS" },
    { href: "sobre", label: "SOBRE" },
  ];

  // Add pre-filtered links
  const defaultFilterLinks = [
    { href: "imoveis?tipo=Apartamento", label: "APARTAMENTOS" },
    { href: "imoveis?tipo=Casa", label: "CASAS" },
    { href: "imoveis?finalidade=aluguel", label: "ALUGUEL" },
  ];

  // Fallback arrays
  const mainNavLinks = hasDynamicMenu ? [] : defaultMainNavLinks;
  const filterLinks = hasDynamicMenu ? [] : defaultFilterLinks;

  return (
    <div className="min-h-screen flex flex-col public-site-wrapper" style={{ backgroundColor, color: textColor }} role="document">
      {/* Header - Floating Glassmorphism */}
      <header className="fixed top-0 left-0 right-0 z-50" role="banner">
        <div className="max-w-[1200px] mx-auto px-2 sm:px-4 pt-4">
          <div 
            className="backdrop-blur-2xl rounded-2xl px-4 sm:px-8"
            style={{ 
              backgroundColor: 'rgba(0,0,0,0.6)', 
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' 
            }}
          >
            <div className="flex justify-between items-center h-[70px] md:h-[85px]">
              {/* Logo */}
              <Link to={getHref("")} className="flex items-center min-w-0 flex-shrink pr-4">
                {isLoading && !siteConfig ? (
                  <Skeleton className="h-8 md:h-10 w-24 md:w-40 bg-white/10" />
                ) : siteConfig?.logo_url ? (
                  <div className="flex items-center justify-start h-full max-w-[150px] md:max-w-[250px]">
                    <img 
                      src={siteConfig?.logo_url} 
                      alt={siteConfig?.site_title} 
                      className="w-auto h-auto max-h-[35px] md:max-h-[55px] object-contain"
                      style={{ 
                        width: siteConfig?.logo_width ? `${Math.min(siteConfig?.logo_width, 250)}px` : 'auto',
                      }}
                    />
                  </div>
                ) : (
                  <span className="text-sm md:text-xl font-bold tracking-[0.2em] uppercase truncate" style={{ color: '#fff' }}>
                    {siteConfig?.site_title || 'Site Imobiliário'}
                  </span>
                )}
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-1" aria-label="Navegação principal">
                {isLoading && !siteConfig && (
                  <>
                    <Skeleton className="h-6 w-16 bg-white/10 mx-2" />
                    <Skeleton className="h-6 w-20 bg-white/10 mx-2" />
                    <Skeleton className="h-6 w-16 bg-white/10 mx-2" />
                  </>
                )}
                {/* Dynamic menu items */}
                {allNavItems ? allNavItems.map((item) => (
                  item.link_type === 'external' ? (
                    <a
                      key={item.href}
                      href={item.href}
                      target={item.open_in_new_tab ? "_blank" : undefined}
                      rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
                      className="px-4 py-2 text-sm font-light tracking-wider transition-colors"
                      style={{ color: 'rgba(255,255,255,0.8)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = primaryColor}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      to={getHref(item.href)}
                      className="px-4 py-2 text-sm font-light tracking-wider transition-colors"
                      style={{ 
                        color: (item.link_type === 'filter' ? isFilterActive(item.href) : isActive(item.href)) ? primaryColor : 'rgba(255,255,255,0.8)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = primaryColor}
                      onMouseLeave={(e) => {
                        const active = item.link_type === 'filter' ? isFilterActive(item.href) : isActive(item.href);
                        e.currentTarget.style.color = active ? primaryColor : 'rgba(255,255,255,0.8)';
                      }}
                    >
                      {item.label}
                    </Link>
                  )
                )) : (
                  <>
                    {mainNavLinks.map((link) => (
                      <Link
                        key={link.href}
                        to={getHref(link.href)}
                        className="px-4 py-2 text-sm font-light tracking-wider transition-colors"
                        style={{ 
                          color: isActive(link.href) ? primaryColor : 'rgba(255,255,255,0.8)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = primaryColor}
                        onMouseLeave={(e) => e.currentTarget.style.color = isActive(link.href) ? primaryColor : 'rgba(255,255,255,0.8)'}
                      >
                        {link.label}
                      </Link>
                    ))}
                    {/* Pre-filtered Links */}
                    {filterLinks.map((link) => (
                      <Link
                        key={link.href}
                        to={getHref(link.href)}
                        className="px-4 py-2 text-sm font-light tracking-wider transition-colors"
                        style={{ 
                          color: isFilterActive(link.href) ? primaryColor : 'rgba(255,255,255,0.8)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = primaryColor}
                        onMouseLeave={(e) => e.currentTarget.style.color = isFilterActive(link.href) ? primaryColor : 'rgba(255,255,255,0.8)'}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </>
                )}
              </nav>

              {/* Desktop CTA */}
              <div className="hidden lg:flex items-center gap-4">
                <Link to={getHref("favoritos")} className="relative transition-colors" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  <Heart className="w-5 h-5" />
                  {favCount > 0 && (
                    <span 
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {favCount}
                    </span>
                  )}
                </Link>
                <Link 
                  to={getHref("contato")}
                  className="px-6 py-2.5 rounded-full text-sm font-light tracking-wide transition-colors hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: 'white' }}
                >
                  CONTATO
                </Link>
              </div>

              {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="lg:hidden p-2" style={{ color: '#fff' }} aria-label="Abrir menu de navegação">
                  <Menu className="w-6 h-6" aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0 border-0" style={{ backgroundColor, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                <div className="flex flex-col h-full">
                  {/* Mobile Header */}
                  <div className="p-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                    {siteConfig?.logo_url ? (
                     <img 
                         src={siteConfig?.logo_url} 
                         alt={siteConfig?.site_title} 
                         width={Math.min(siteConfig?.logo_width || 160, 200)}
                         height={Math.min(siteConfig?.logo_height || 50, 55)}
                         style={{ 
                           maxWidth: Math.min(siteConfig?.logo_width || 160, 200), 
                           maxHeight: Math.min(siteConfig?.logo_height || 50, 55) 
                         }}
                         className="w-auto object-contain"
                       />
                    ) : (
                      <span className="text-lg font-semibold tracking-wider" style={{ color: textColor }}>
                        {siteConfig?.site_title}
                      </span>
                    )}
                  </div>

                  {/* Mobile Navigation */}
                  <nav className="flex-1 p-4">
                    <div className="space-y-1">
                      {allNavItems ? allNavItems.map((item) => (
                        item.link_type === 'external' ? (
                          <a
                            key={item.href}
                            href={item.href}
                            target={item.open_in_new_tab ? "_blank" : undefined}
                            rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
                            onClick={() => setMobileMenuOpen(false)}
                            className="block px-4 py-3 text-sm font-medium tracking-wider transition-colors"
                            style={{ color: isDarkTheme ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)' }}
                          >
                            {item.label}
                          </a>
                        ) : (
                          <Link
                            key={item.href}
                            to={getHref(item.href)}
                            onClick={() => setMobileMenuOpen(false)}
                            className="block px-4 py-3 text-sm font-medium tracking-wider transition-colors"
                            style={{ 
                              color: (item.link_type === 'filter' ? isFilterActive(item.href) : isActive(item.href)) ? primaryColor : (isDarkTheme ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'),
                              backgroundColor: isActive(item.href) ? (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : 'transparent'
                            }}
                          >
                            {item.label}
                          </Link>
                        )
                      )) : (
                        <>
                          {mainNavLinks.map((link) => (
                            <Link
                              key={link.href}
                              to={getHref(link.href)}
                              onClick={() => setMobileMenuOpen(false)}
                              className="block px-4 py-3 text-sm font-medium tracking-wider transition-colors"
                              style={{ 
                                color: isActive(link.href) ? primaryColor : (isDarkTheme ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'),
                                backgroundColor: isActive(link.href) ? (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : 'transparent'
                              }}
                            >
                              {link.label}
                            </Link>
                          ))}
                          
                          <div className="my-4" style={{ borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}></div>
                          
                          {filterLinks.map((link) => (
                            <Link
                              key={link.href}
                              to={getHref(link.href)}
                              onClick={() => setMobileMenuOpen(false)}
                              className="block px-4 py-3 text-sm font-medium tracking-wider transition-colors"
                              style={{ color: isDarkTheme ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)' }}
                            >
                              {link.label}
                            </Link>
                          ))}
                          
                          <div className="my-4" style={{ borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}></div>
                          
                          <Link
                            to={getHref("contato")}
                            onClick={() => setMobileMenuOpen(false)}
                            className="block px-4 py-3 text-sm font-medium tracking-wider transition-colors"
                            style={{ color: primaryColor }}
                          >
                            CONTATO
                          </Link>
                        </>
                      )}
                    </div>
                  </nav>

                  {/* Mobile Footer */}
                  {siteConfig?.whatsapp && (
                    <div className="p-4" style={{ borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                      <a
                        href={`https://wa.me/${siteConfig?.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white font-medium rounded"
                      >
                        <MessageCircle className="w-5 h-5" />
                        WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Add padding for fixed header */}
      <main className="flex-1" role="main">
        <Outlet />
      </main>

      {/* Floating WhatsApp Button - Mobile - Opens Contact Form */}
      {siteConfig?.whatsapp && organizationId && (
        <div className="lg:hidden fixed bottom-6 right-6 z-50">
          <ContactFormDialog
            organizationId={organizationId}
            whatsappNumber={siteConfig?.whatsapp}
            primaryColor={primaryColor}
            trigger={
              <button className="w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center hover:bg-[#20BD5A] transition-colors" aria-label="Fale conosco pelo WhatsApp">
                <MessageCircle className="w-7 h-7" aria-hidden="true" />
              </button>
            }
          />
        </div>
      )}

      {/* Footer - Dark Style */}
      <footer 
        role="contentinfo"
        style={{ backgroundColor: secondaryColor, color: textColor, borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-10">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="flex justify-center md:justify-start">
                {isLoading && !siteConfig ? (
                  <Skeleton className="h-10 w-32 bg-white/10 mb-4" />
                ) : siteConfig?.logo_url ? (
                  <img 
                    src={siteConfig?.logo_url} 
                    alt={siteConfig?.site_title || 'Logo'} 
                    loading="lazy"
                    decoding="async"
                    width={siteConfig?.logo_width || 160}
                    height={siteConfig?.logo_height || 50}
                    style={{ 
                      maxWidth: siteConfig?.logo_width || 160, 
                      maxHeight: siteConfig?.logo_height || 50 
                    }}
                    className="w-auto object-contain mb-4"
                  />
                ) : (
                  <h3 className="text-xl font-semibold tracking-wider mb-4">{siteConfig?.site_title}</h3>
                )}
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-4 md:mb-6">
                {isLoading && !siteConfig ? (
                  <Skeleton className="h-4 w-full bg-white/10" />
                ) : (
                  siteConfig?.site_description || `Encontre o imóvel dos seus sonhos com a ${siteConfig?.organization_name || 'nossa imobiliária'}.`
                )}
              </p>
            </div>

            {/* Menu & Contact - 2 columns on mobile */}
            <div className="grid grid-cols-2 md:contents gap-4 text-center md:text-left">
              {/* Menu */}
              <div>
                <h4 
                  className="text-sm font-semibold uppercase tracking-wider mb-3 md:mb-4"
                  style={{ color: primaryColor }}
                >
                  Menu
                </h4>
                <ul className="space-y-2 md:space-y-3">
                  {allNavItems ? allNavItems.map((item) => (
                    <li key={item.href}>
                      {item.link_type === 'external' ? (
                        <a 
                          href={item.href}
                          target={item.open_in_new_tab ? "_blank" : undefined}
                          rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
                          onClick={handleFooterClick}
                          className="text-white/60 hover:text-white transition-colors text-sm"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link 
                          to={getHref(item.href)}
                          onClick={handleFooterClick}
                          className="text-white/60 hover:text-white transition-colors text-sm"
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  )) : (
                    <>
                      {mainNavLinks.map((link) => (
                        <li key={link.href}>
                          <Link 
                            to={getHref(link.href)}
                            onClick={handleFooterClick}
                            className="text-white/60 hover:text-white transition-colors text-sm"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                      <li>
                        <Link 
                          to={getHref("contato")}
                          onClick={handleFooterClick}
                          className="text-white/60 hover:text-white transition-colors text-sm"
                        >
                          CONTATO
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* Contact */}
              <div>
                <h4 
                  className="text-sm font-semibold uppercase tracking-wider mb-3 md:mb-4"
                  style={{ color: primaryColor }}
                >
                  Contato
                </h4>
                <ul className="space-y-2 md:space-y-3">
                  {isLoading && !siteConfig && (
                    <>
                      <Skeleton className="h-4 w-32 bg-white/10" />
                      <Skeleton className="h-4 w-24 bg-white/10" />
                    </>
                  )}
                  {siteConfig?.phone && (
                    <li>
                      <a 
                        href={`tel:${siteConfig?.phone}`}
                        className="flex items-center justify-center md:justify-start gap-2 md:gap-3 text-white/60 hover:text-white transition-colors text-sm"
                      >
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden md:inline">{siteConfig?.phone}</span>
                        <span className="md:hidden">Telefone</span>
                      </a>
                    </li>
                  )}
                  {siteConfig?.whatsapp && organizationId && (
                    <li className="flex justify-center md:justify-start">
                      <ContactFormDialog
                        organizationId={organizationId}
                        whatsappNumber={siteConfig?.whatsapp}
                        primaryColor={primaryColor}
                        trigger={
                          <button className="flex items-center gap-2 md:gap-3 text-white/60 hover:text-white transition-colors text-sm cursor-pointer">
                            <MessageCircle className="w-4 h-4 flex-shrink-0" />
                            WhatsApp
                          </button>
                        }
                      />
                    </li>
                  )}
                  {siteConfig?.email && (
                    <li>
                      <a 
                        href={`mailto:${siteConfig?.email}`}
                        className="flex items-center justify-center md:justify-start gap-2 md:gap-3 text-white/60 hover:text-white transition-colors text-sm"
                      >
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden md:inline">{siteConfig?.email}</span>
                        <span className="md:hidden">E-mail</span>
                      </a>
                    </li>
                  )}
                </ul>
                {siteConfig?.address && (
                  <div className="flex items-start justify-center md:justify-start gap-2 text-white/60 text-sm mt-3">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      {siteConfig?.address}
                      {siteConfig?.city && <><br />{siteConfig?.city}</>}
                      {siteConfig?.state && ` - ${siteConfig?.state}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Social */}
            <div className="text-center md:text-left col-span-1">
              <h4 
                className="text-sm font-semibold uppercase tracking-wider mb-3 md:mb-4"
                style={{ color: primaryColor }}
              >
                Redes Sociais
              </h4>
              <div className="flex gap-3 justify-center md:justify-start">
                {isLoading && !siteConfig && (
                  <>
                    <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
                    <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
                  </>
                )}
                {siteConfig?.instagram && (
                  <a 
                    href={siteConfig?.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/30 hover:scale-110"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = primaryColor; e.currentTarget.style.borderColor = primaryColor; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {siteConfig?.facebook && (
                  <a 
                    href={siteConfig?.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/30 hover:scale-110"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = primaryColor; e.currentTarget.style.borderColor = primaryColor; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  >
                    <Facebook className="w-5 h-5" />
                  </a>
                )}
                {siteConfig?.youtube && (
                  <a 
                    href={siteConfig?.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/30 hover:scale-110"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = primaryColor; e.currentTarget.style.borderColor = primaryColor; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  >
                    <Youtube className="w-5 h-5" />
                  </a>
                )}
                {siteConfig?.linkedin && (
                  <a 
                    href={siteConfig?.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all border border-white/30 hover:scale-110"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = primaryColor; e.currentTarget.style.borderColor = primaryColor; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/40">
              <p>© {new Date().getFullYear()} {siteConfig?.organization_name || 'nossa imobiliária'}. Todos os direitos reservados.</p>
              <p className="flex items-center gap-0.5">
                Desenvolvido por{' '}
                <a 
                  href="https://vimob.com.br" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity inline-flex items-center"
                >
                  <img src="/logo-white.png" alt="VIMOB" className="h-[60px] w-auto opacity-60 hover:opacity-90 transition-opacity" />
                </a>
              </p>
            </div>
          </div>
        </div>
    </footer>

      {/* Cookie Consent Banner */}
      <CookieConsent primaryColor={primaryColor} />
    </div>
  );
}
