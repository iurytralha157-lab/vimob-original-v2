import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PublicSiteProvider } from "@/contexts/PublicSiteContext";

// All lazy — keeps public bundle separate from CRM
const PublicSiteLayout = lazy(() => import("./pages/public/PublicSiteLayout"));
const PublicHome = lazy(() => import("./pages/public/PublicHome"));
const PublicProperties = lazy(() => import("./pages/public/PublicProperties"));
const PublicPropertyDetail = lazy(() => import("./pages/public/PublicPropertyDetail"));
const PublicAbout = lazy(() => import("./pages/public/PublicAbout"));
const PublicContact = lazy(() => import("./pages/public/PublicContact"));
const PublicFavorites = lazy(() => import("./pages/public/PublicFavorites"));
const PublishedSiteWrapper = lazy(() => import("./pages/public/PublishedSiteWrapper"));
const APIDocs = lazy(() => import("./pages/public/APIDocs"));

function CustomDomainRoutes() {
  return (
    <PublicSiteProvider>
      <ScrollToTop />
      <Suspense fallback={null}>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PublicSiteProvider>
  );
}

interface Props {
  mode: "custom-domain" | "slug" | "mixed";
}

export default function PublicAppRoot({ mode }: Props) {
  // Idle preload of properties page for snappier in-site navigation
  useEffect(() => {
    const ric = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1500));
    const handle = ric(() => {
      void import("./pages/public/PublicProperties");
      void import("./pages/public/PublicPropertyDetail");
    });
    return () => {
      const cancel = (window as any).cancelIdleCallback;
      if (cancel && typeof handle === "number") cancel(handle);
    };
  }, []);

  return (
    <LanguageProvider>
      {mode === "custom-domain" ? (
        <CustomDomainRoutes />
      ) : (
        <>
          <ScrollToTop />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/sites/:slug/*" element={<PublishedSiteWrapper />} />
              <Route path="/docs/api" element={<APIDocs />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </>
      )}
    </LanguageProvider>
  );
}
