import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { SuperAdminRoute } from "@/components/guards/SuperAdminRoute";
import { AdminRoute } from "@/components/guards/AdminRoute";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ImpersonateBanner } from "@/components/admin/ImpersonateBanner";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { useForceRefreshListener } from "@/hooks/use-force-refresh";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useSystemBranding } from "@/hooks/use-system-branding";
import { SetupGuideDialog } from "@/components/setup-guide/SetupGuideDialog";
import { MetricsPanel } from "@/components/MetricsPanel";
import { ModuleGuard } from "@/components/guards/ModuleGuard";
import { isBillingAccessRoute, isBillingBlockedStatus } from "@/lib/billing-access";

// Public site root â€” separate bundle, no CRM providers
const PublicAppRoot = lazy(() => import("./PublicAppRoot"));

const SETUP_GUIDE_BLOCKED_PATH_PREFIXES = [
  "/auth",
  "/login",
  "/signup",
  "/onboarding",
  "/reset-password",
  "/site",
  "/sites",
  "/public",
  "/api",
  "/docs",
];

const shouldHideSetupGuide = (pathname: string) =>
  SETUP_GUIDE_BLOCKED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

function LegacyGamificationRedirect() {
  const location = useLocation();
  const nextPath = location.pathname.replace(/^\/gamification/, "/gamificacao");
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />;
}

// Lazy imports - critical routes
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Lazy imports - heavy pages
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Signup = lazy(() => import("./pages/Signup"));
const SelectOrganization = lazy(() => import("./pages/SelectOrganization"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pipelines = lazy(() => import("./pages/Pipelines"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Properties = lazy(() => import("./pages/Properties"));
const PropertyForm = lazy(() => import("./pages/PropertyForm"));
const PropertyRentals = lazy(() => import("./pages/PropertyRentals"));
const PropertyLocations = lazy(() => import("./pages/PropertyLocations"));
const CRMManagement = lazy(() => import("./pages/CRMManagement"));
const Settings = lazy(() => import("./pages/Settings"));
const SiteSettings = lazy(() => import("./pages/SiteSettings"));
const Help = lazy(() => import("./pages/Help"));
const Conversations = lazy(() => import("./pages/Conversations"));
const Agenda = lazy(() => import("./pages/Agenda"));
const FinancialDashboard = lazy(() => import("./pages/FinancialDashboard"));
const FinancialEntries = lazy(() => import("./pages/FinancialEntries"));
const Contracts = lazy(() => import("./pages/Contracts"));
const ContractDetails = lazy(() => import("./pages/ContractDetails"));
const Commissions = lazy(() => import("./pages/Commissions"));
const BrokerFinancialPanel = lazy(() => import("./pages/BrokerFinancialPanel"));
const FinancialReports = lazy(() => import("./pages/FinancialReports"));
const FinancialDRE = lazy(() => import("./pages/FinancialDRE"));
const MetaSettings = lazy(() => import("./pages/MetaSettings"));
const WhatsAppInboundRules = lazy(() => import("./pages/WhatsAppInboundRules"));
const Automations = lazy(() => import("./pages/Automations"));
const Notifications = lazy(() => import("./pages/Notifications"));
const GamificationLayout = lazy(() => import("./pages/gamification/GamificationLayout"));
const GamificationDashboard = lazy(() => import("./pages/gamification/GamificationDashboard"));
const GamificationRanking = lazy(() => import("./pages/gamification/GamificationRanking"));
const GamificationAdmin = lazy(() => import("./pages/gamification/GamificationAdmin"));
const GamificationHistory = lazy(() => import("./pages/gamification/GamificationHistory"));
const GamificationPerformance = lazy(() => import("./pages/gamification/GamificationPerformance"));

// Engineering pages
const ConstructionProjects = lazy(() => import("./pages/engineering/ConstructionProjects"));
const ConstructionProjectDetail = lazy(() => import("./pages/engineering/ConstructionProjectDetail"));
const ConstructionProjectForm = lazy(() => import("./pages/engineering/ConstructionProjectForm"));

// Telecom pages
const ServicePlans = lazy(() => import("./pages/ServicePlans"));
const CoverageAreas = lazy(() => import("./pages/CoverageAreas"));
const TelecomCustomers = lazy(() => import("./pages/TelecomCustomers"));
const TelecomBilling = lazy(() => import("./pages/TelecomBilling"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOrganizations = lazy(() => import("./pages/admin/AdminOrganizations"));
const AdminOrganizationDetail = lazy(() => import("./pages/admin/AdminOrganizationDetail"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/admin/SystemSettings"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const AdminRequests = lazy(() => import("./pages/admin/AdminRequests"));
const AdminPlans = lazy(() => import("./pages/admin/AdminPlans"));
const AdminAnnouncements = lazy(() => import("./pages/admin/AdminAnnouncements"));
const AdminHelpEditor = lazy(() => import("./pages/admin/AdminHelpEditor"));
const AdminDatabase = lazy(() => import("./pages/admin/AdminDatabase"));
const AdminOnboarding = lazy(() => import("./pages/admin/AdminOnboarding"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminAI = lazy(() => import("./pages/admin/AdminAI"));
const Checkout = lazy(() => import("./pages/Checkout"));
const EmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const EmailLogs = lazy(() => import("./pages/admin/EmailLogs"));
const LegalPage = lazy(() => import("./pages/public/LegalPage"));

// Public site preview (used inside CRM)
const PreviewSiteWrapper = lazy(() => import("./pages/public/PreviewSiteWrapper"));
const APIDocs = lazy(() => import("./pages/public/APIDocs"));
const ObrasOverview = lazy(() => import("./pages/operational/ObrasOverview"));
const EngineeringDashboard = lazy(() => import("./pages/engineering/EngineeringDashboard"));
const ArchitectureDashboard = lazy(() => import("./pages/architecture/ArchitectureDashboard"));
const PurchaseDashboard = lazy(() => import("./pages/purchase/PurchaseDashboard"));
const OperationalQueues = lazy(() => import("./pages/operational/OperationalQueues"));
const ExecutiveDRE = lazy(() => import("./pages/financial/ExecutiveDRE"));

// Trial expired modal
const TrialExpiredModal = lazy(() =>
  import("./components/admin/TrialExpiredModal").then((m) => ({ default: m.TrialExpiredModal })),
);

function preloadCoreCrmPages() {
  void import("./pages/Dashboard");
  void import("./pages/Pipelines");
  void import("./pages/Contacts");
  void import("./pages/Conversations");
}

function getPublicSiteMode(): "custom-domain" | "slug" | null {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const isIpv4Host = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);

  if (pathname.startsWith("/sites/")) return "slug";

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    isIpv4Host ||
    hostname.endsWith(".lovable.dev") ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "vimobe.lovable.app" ||
    hostname.startsWith("id-preview--")
  ) {
    return null;
  }

  if (hostname === "vimob.vettercompany.com.br") return null;

  return "custom-domain";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const DEFAULT_BRAND_ICON = "/favicon.webp?v=20260605";

const PageLoader = () => {
  const logoUrl = DEFAULT_BRAND_ICON;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center">
            <img
              src={logoUrl}
              alt="Vimob"
              className="h-14 w-14 object-contain drop-shadow-[0_10px_22px_hsl(var(--primary)/0.22)]"
              decoding="async"
              loading="eager"
            />
          </div>
        </div>
        <div className="text-center text-xs font-light uppercase tracking-[0.28em] text-muted-foreground">
          Carregando
          <span className="inline-flex w-6 justify-start text-primary">
            <span className="animate-[loader-dot_1.4s_infinite]">.</span>
            <span className="animate-[loader-dot_1.4s_infinite_0.2s]">.</span>
            <span className="animate-[loader-dot_1.4s_infinite_0.4s]">.</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// â”€â”€â”€ PROTECTED ROUTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FIX: aguarda authInitialized + organizationsLoaded + !isInitializingOrg
// antes de tomar qualquer decisÃ£o de redirecionamento. Sem isso, hÃ¡ race
// condition onde o usuÃ¡rio Ã© mandado para /onboarding ou /auth enquanto
// as orgs ainda estÃ£o carregando.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const {
    user,
    loading,
    authInitialized,
    organizationsLoaded,
    organization,
    userOrganizations,
    isSuperAdmin,
    impersonating,
    isInitializingOrg,
  } = useAuth();

  // Aguarda inicializaÃ§Ã£o completa antes de qualquer decisÃ£o
  if (loading || !authInitialized || !organizationsLoaded || isInitializingOrg) {
    return <PageLoader />;
  }

  // NÃ£o autenticado â†’ login
  if (!user) return <Navigate to="/auth" replace />;

  const orgCount = userOrganizations?.length ?? 0;
  const hasValidActiveOrg = !!organization || !!impersonating || (isSuperAdmin && !organization);

  // Tem orgs mas nenhuma ativa ainda â†’ seleÃ§Ã£o
  if (orgCount > 0 && !hasValidActiveOrg) {
    return <Navigate to="/select-organization" replace />;
  }

  // Sem orgs e nÃ£o Ã© superadmin â†’ seleÃ§Ã£o/estado de acesso.
  // Onboarding fica disponÃ­vel apenas por link direto ou pelo CTA de cadastro.
  if (orgCount === 0 && !isSuperAdmin) {
    return <Navigate to="/select-organization" replace />;
  }

  const isBillingBlocked =
    !!organization &&
    !isSuperAdmin &&
    !impersonating &&
    isBillingBlockedStatus(organization.subscription_status);

  if (isBillingBlocked && !isBillingAccessRoute(location.pathname, location.search)) {
    return <Navigate to="/settings?tab=subscription" replace />;
  }

  return <>{children}</>;
}

// â”€â”€â”€ APP ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AppRoutes() {
  const {
    user,
    loading,
    profile,
    isSuperAdmin,
    impersonating,
    authInitialized,
    organizationsLoaded,
    userOrganizations,
    organization,
    isInitializingOrg,
  } = useAuth();

  useForceRefreshListener(!!user, user?.id);

  useEffect(() => {
    if (user && !loading && organizationsLoaded) {
      const timer = setTimeout(preloadCoreCrmPages, 3000);
      return () => clearTimeout(timer);
    }
  }, [user, loading, organizationsLoaded]);

  // FIX: getDefaultRedirect agora Ã© uma funÃ§Ã£o pura sem console.log em produÃ§Ã£o.
  // A lÃ³gica foi simplificada e comentada para deixar claro cada caso.
  const getDefaultRedirect = (): string => {
    const orgCount = userOrganizations?.length ?? 0;
    const hasActiveOrg = !!organization || !!impersonating;

    // SuperAdmin sem impersonation â†’ painel admin
    if (isSuperAdmin && !impersonating && !organization) return "/admin";

    // Sem orgs e nÃ£o Ã© superadmin â†’ seleÃ§Ã£o/estado de acesso.
    // NÃ£o redireciona automaticamente para onboarding.
    if (orgCount === 0 && !isSuperAdmin) return "/select-organization";

    // Org ativa carregada â†’ dashboard
    if (orgCount > 1) return "/select-organization";

    if (hasActiveOrg) return "/dashboard";

    // MÃºltiplas orgs sem nenhuma salva â†’ seleÃ§Ã£o
    // PadrÃ£o (1 org, ou multi com org salva que serÃ¡ carregada pelo AuthContext)
    return "/dashboard";
  };

  // FIX: /auth agora redireciona para o destino correto baseado no perfil completo,
  // nÃ£o apenas para /dashboard fixo. TambÃ©m removido o console.log de debug que
  // vazava info em produÃ§Ã£o.
  const renderAuthRoute = () => {
    // Aguarda inicializaÃ§Ã£o bÃ¡sica do auth
    if (loading || !authInitialized) return <PageLoader />;

    if (user) {
      // Logado: aguarda orgs carregarem para redirecionar para o lugar certo
      if (!organizationsLoaded || isInitializingOrg) return <PageLoader />;
      return <Navigate to={getDefaultRedirect()} replace />;
    }

    return <Auth />;
  };

  const location = useLocation();
  const isResetPasswordRoute = location.pathname === "/reset-password";
  const hideSetupGuide = isResetPasswordRoute || shouldHideSetupGuide(location.pathname);

  return (
    <>
      {!isResetPasswordRoute && <AnnouncementBanner />}
      {!isResetPasswordRoute && <ImpersonateBanner />}
      {!isResetPasswordRoute && (
        <Suspense fallback={null}>
          <TrialExpiredModal />
        </Suspense>
      )}
      {!hideSetupGuide && user && profile && profile.organization_id && <SetupGuideDialog />}
      <ScrollToTop />
      <div className={impersonating ? "pt-12" : ""}>
        {isSuperAdmin && <MetricsPanel />}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* â”€â”€ Rotas pÃºblicas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route path="/auth" element={renderAuthRoute()} />
            <Route
              path="/reset-password"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ResetPassword />
                </Suspense>
              }
            />
            <Route
              path="/signup"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Signup />
                </Suspense>
              }
            />
            <Route
              path="/onboarding"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Onboarding />
                </Suspense>
              }
            />
            <Route
              path="/checkout/:token"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Checkout />
                </Suspense>
              }
            />
            <Route
              path="/privacidade"
              element={
                <Suspense fallback={<PageLoader />}>
                  <LegalPage />
                </Suspense>
              }
            />
            <Route
              path="/termos"
              element={
                <Suspense fallback={<PageLoader />}>
                  <LegalPage />
                </Suspense>
              }
            />
            <Route path="/assinatura" element={<Navigate to="/settings?tab=subscription" replace />} />

            {/* â”€â”€ SeleÃ§Ã£o de organizaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {/* FIX: lÃ³gica inline simplificada e consistente com ProtectedRoute */}
            <Route
              path="/select-organization"
              element={
                loading || !authInitialized || !organizationsLoaded || isInitializingOrg ? (
                  <PageLoader />
                ) : !user ? (
                  <Navigate to="/auth" replace />
                ) : (userOrganizations?.length ?? 0) === 0 && !isSuperAdmin ? (
                  <Suspense fallback={<PageLoader />}>
                    <SelectOrganization />
                  </Suspense>
                ) : (userOrganizations?.length ?? 0) <= 1 ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Suspense fallback={<PageLoader />}>
                    <SelectOrganization />
                  </Suspense>
                )
              }
            />

            {/* â”€â”€ Super Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/admin"
              element={
                <SuperAdminRoute>
                  <AdminDashboard />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/organizations"
              element={
                <SuperAdminRoute>
                  <AdminOrganizations />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/organizations/:id"
              element={
                <SuperAdminRoute>
                  <AdminOrganizationDetail />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <SuperAdminRoute>
                  <AdminUsers />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/plans"
              element={
                <SuperAdminRoute>
                  <AdminPlans />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/announcements"
              element={
                <SuperAdminRoute>
                  <AdminAnnouncements />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/help-editor"
              element={
                <SuperAdminRoute>
                  <AdminHelpEditor />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/database"
              element={
                <SuperAdminRoute>
                  <AdminDatabase />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <SuperAdminRoute>
                  <AdminSettings />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/ai"
              element={
                <SuperAdminRoute>
                  <AdminAI />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/requests"
              element={
                <SuperAdminRoute>
                  <AdminRequests />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <SuperAdminRoute>
                  <AdminAudit />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/email-templates"
              element={
                <SuperAdminRoute>
                  <EmailTemplates />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/email-logs"
              element={
                <SuperAdminRoute>
                  <EmailLogs />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/onboarding"
              element={
                <SuperAdminRoute>
                  <AdminOnboarding />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/admin/notifications"
              element={
                <AdminRoute>
                  <AdminNotifications />
                </AdminRoute>
              }
            />

            {/* â”€â”€ Raiz â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {/* FIX: / agora aguarda auth completo antes de redirecionar,
                evitando flash de /dashboard antes de saber o destino real */}
            <Route
              path="/"
              element={
                loading || !authInitialized || !organizationsLoaded || isInitializingOrg ? (
                  <PageLoader />
                ) : (
                  <Navigate to={getDefaultRedirect()} replace />
                )
              }
            />

            {/* â”€â”€ CRM Principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/campaigns"
              element={
                <ProtectedRoute>
                  <Navigate to="/dashboard" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/pipelines"
              element={
                <ProtectedRoute>
                  <Pipelines />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/contacts"
              element={
                <ProtectedRoute>
                  <Contacts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/management"
              element={
                <ProtectedRoute>
                  <AdminRoute allowedPermissions={['settings_teams', 'settings_users', 'settings_pipelines']}>
                    <CRMManagement />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agenda"
              element={
                <ProtectedRoute>
                  <Agenda />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties"
              element={
                <ProtectedRoute>
                  <Properties />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/new"
              element={
                <ProtectedRoute>
                  <PropertyForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/:id/edit"
              element={
                <ProtectedRoute>
                  <PropertyForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/rentals"
              element={
                <ProtectedRoute>
                  <PropertyRentals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/condominiums"
              element={
                <ProtectedRoute>
                  <PropertyLocations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/locations"
              element={
                <ProtectedRoute>
                  <PropertyLocations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/site"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <SiteSettings />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/integrations/meta"
              element={
                <ProtectedRoute>
                  <MetaSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/whatsapp/inbound-rules"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <WhatsAppInboundRules />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/conversas"
              element={
                <ProtectedRoute>
                  <Conversations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/help"
              element={
                <ProtectedRoute>
                  <Help />
                </ProtectedRoute>
              }
            />

            {/* â”€â”€ Financeiro â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/financeiro"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <FinancialDashboard />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/contas"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <FinancialEntries />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/contratos"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Contracts />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/contratos/:id"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <ContractDetails />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/comissoes"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Commissions />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/corretor"
              element={
                <ProtectedRoute>
                  <BrokerFinancialPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/relatorios"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <FinancialReports />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/dre"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <FinancialDRE />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/financeiro/dre-executivo"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <ExecutiveDRE />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />

            {/* â”€â”€ Obras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/obras/obras"
              element={
                <ProtectedRoute>
                  <PermissionGuard permission="module_engineering">
                    <ConstructionProjects />
                  </PermissionGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/obras/nova"
              element={
                <ProtectedRoute>
                  <PermissionGuard permission="module_engineering">
                    <ConstructionProjectForm />
                  </PermissionGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/obras/:id"
              element={
                <ProtectedRoute>
                  <PermissionGuard permission="module_engineering">
                    <ConstructionProjectDetail />
                  </PermissionGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/obras/:id/editar"
              element={
                <ProtectedRoute>
                  <PermissionGuard permission="module_engineering">
                    <ConstructionProjectForm />
                  </PermissionGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/overview"
              element={
                <ProtectedRoute>
                  <ObrasOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/engenharia"
              element={
                <ProtectedRoute>
                  <EngineeringDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/arquitetura"
              element={
                <ProtectedRoute>
                  <ArchitectureDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/compras"
              element={
                <ProtectedRoute>
                  <PurchaseDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/financeiro"
              element={
                <ProtectedRoute>
                  <ExecutiveDRE />
                </ProtectedRoute>
              }
            />
            <Route
              path="/obras/filas"
              element={
                <ProtectedRoute>
                  <OperationalQueues />
                </ProtectedRoute>
              }
            />

            {/* â”€â”€ Telecom â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/plans"
              element={
                <ProtectedRoute>
                  <ServicePlans />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coverage"
              element={
                <ProtectedRoute>
                  <CoverageAreas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/telecom/customers"
              element={
                <ProtectedRoute>
                  <TelecomCustomers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/telecom/billing"
              element={
                <ProtectedRoute>
                  <TelecomBilling />
                </ProtectedRoute>
              }
            />

            {/* â”€â”€ GamificaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {/* FIX: removida rota <Route index> duplicada dentro de /gamificacao */}
            <Route
              path="/gamificacao"
              element={
                <ProtectedRoute>
                  <ModuleGuard module="gamification">
                    <GamificationLayout />
                  </ModuleGuard>
                </ProtectedRoute>
              }
            >
              <Route index element={<GamificationRanking />} />
              <Route path="dashboard" element={<GamificationDashboard />} />
              <Route path="performance" element={<GamificationPerformance />} />
              <Route path="historico" element={<GamificationHistory />} />
              <Route path="configuracoes" element={<GamificationAdmin />} />
            </Route>
            <Route path="/gamification/*" element={<LegacyGamificationRedirect />} />

            {/* â”€â”€ AutomaÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route
              path="/automations"
              element={
                <ProtectedRoute>
                  <PermissionGuard permission="automations_view">
                    <Automations />
                  </PermissionGuard>
                </ProtectedRoute>
              }
            />

            {/* â”€â”€ Site pÃºblico / docs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Route path="/site/preview/*" element={<PreviewSiteWrapper />} />
            <Route path="/site/previsualizaÃ§Ã£o/*" element={<PreviewSiteWrapper />} />
            <Route
              path="/docs/api"
              element={
                <Suspense fallback={<PageLoader />}>
                  <APIDocs />
                </Suspense>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

const BrandingAndPwa = () => {
  useSystemBranding();
  return null;
};

const App = () => {
  const publicMode = getPublicSiteMode();

  if (publicMode) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <BrowserRouter>
              <Suspense fallback={null}>
                <PublicAppRoot mode={publicMode} />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <TooltipProvider>
          <BrandingAndPwa />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <FilterProvider>
                <LanguageProvider>
                  <AppRoutes />
                </LanguageProvider>
              </FilterProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
