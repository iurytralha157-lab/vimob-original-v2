import { useState, useMemo, useEffect, useCallback } from "react";
import { z } from "zod";
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, AlertCircle, ShieldAlert } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSystemSettings } from "@/hooks/use-system-settings";
import { useLoginAttempts } from "@/hooks/use-login-attempts";
import { usePasswordStrength, type PasswordStrength } from "@/hooks/use-password-strength";
import { useSecurityLogger } from "@/hooks/use-security-logger";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFriendlyErrorMessage } from "@/lib/error-handler";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

const RESET_COOLDOWN_MS = 60 * 1000;

const STRENGTH_COLORS: Record<PasswordStrength["level"], string> = {
  "very-weak": "bg-red-500",
  weak: "bg-orange-500",
  fair: "bg-yellow-500",
  good: "bg-lime-500",
  strong: "bg-green-500",
};

const STRENGTH_LABELS: Record<PasswordStrength["level"], string> = {
  "very-weak": "Muito fraca",
  weak: "Fraca",
  fair: "Razoável",
  good: "Boa",
  strong: "Forte",
};

export default function Auth() {
  const navigate = useNavigate();
  const {
    user,
    authInitialized,
    organizationsLoaded,
    isInitializingOrg,
    organization,
    userOrganizations,
    isSuperAdmin,
    impersonating,
    signIn,
    resetPassword,
  } = useAuth();
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const { data: systemSettings, isLoading: settingsLoading } = useSystemSettings();
  const loginAttempts = useLoginAttempts();
  const securityLogger = useSecurityLogger();

  const logoUrl = useMemo(() => {
    if (!systemSettings) return null;
    return resolvedTheme === "dark"
      ? systemSettings.logo_url_dark || systemSettings.logo_url_light
      : systemSettings.logo_url_light || systemSettings.logo_url_dark;
  }, [systemSettings, resolvedTheme]);

  const loginBgUrl = useMemo(() => {
    if (!systemSettings) return null;
    return systemSettings.login_bg_url || null;
  }, [systemSettings]);

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("remember_me") === "true";
  });
  const [loginData, setLoginData] = useState(() => {
    const remember = localStorage.getItem("remember_me") === "true";
    const savedEmail = remember ? localStorage.getItem("remembered_email") || "" : "";
    return { email: savedEmail, password: "" };
  });
  const [forgotEmail, setForgotEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bgLoaded, setBgLoaded] = useState(false);
  // Cooldown local apenas para evitar spam visual de solicitação de reset.
  // A regra real de segurança da troca de senha fica na Edge Function `change-password`.
  const [lastResetTime, setLastResetTime] = useState<number>(() => {
    const stored = localStorage.getItem("last_password_reset");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);

  // FIX: redirecionamento agora usa a mesma lógica do App.tsx (getDefaultRedirect),
  // evitando inconsistência onde Auth.tsx mandava sempre para /dashboard
  // enquanto o usuário poderia precisar ir para /admin, /select-organization etc.
  useEffect(() => {
    if (!authInitialized || !user) return;
    if (!organizationsLoaded || isInitializingOrg) return;

    const orgCount = userOrganizations?.length ?? 0;
    const hasActiveOrg = !!organization || !!impersonating;

    let destination = "/dashboard";

    if (isSuperAdmin && !impersonating && !organization) {
      destination = "/admin";
    } else if (orgCount === 0 && !isSuperAdmin) {
      destination = "/select-organization";
    } else if (orgCount > 1) {
      destination = "/select-organization";
    } else if (!hasActiveOrg) {
      destination = "/dashboard";
    }

    navigate(destination, { replace: true });
  }, [
    authInitialized,
    user,
    organizationsLoaded,
    isInitializingOrg,
    organization,
    userOrganizations,
    isSuperAdmin,
    impersonating,
    navigate,
  ]);

  // Otimização de carregamento da imagem de fundo
  useEffect(() => {
    if (!loginBgUrl) return;

    const img = new Image();
    const optimizedUrl = loginBgUrl.includes("supabase.co")
      ? `${loginBgUrl}?width=800&quality=60&format=webp`
      : loginBgUrl;

    img.src = optimizedUrl;
    img.onload = () => setBgLoaded(true);
  }, [loginBgUrl]);

  const setFieldErrorFromZod = (zodError: z.ZodError) => {
    const fieldErrors: Record<string, string> = {};
    zodError.errors.forEach((err) => {
      const key = err.path[0]?.toString();
      if (key) fieldErrors[key] = err.message;
    });
    setErrors(fieldErrors);
  };

  const handleCapsLock = useCallback((e: React.KeyboardEvent) => {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }, []);

  const switchMode = useCallback(
    (newMode: "login" | "forgot") => {
      setIsTransitioning(true);
      setTimeout(() => {
        setMode(newMode);
        setErrors({});
        if (newMode === "forgot") {
          setForgotEmail(loginData.email);
        }
        setTimeout(() => setIsTransitioning(false), 50);
      }, 200);
    },
    [loginData.email],
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (loginAttempts.isLockedOut) {
      const remainingTime = Math.ceil(loginAttempts.remainingLockoutTime / 1000 / 60);
      toast({
        variant: "destructive",
        title: "Muitas tentativas",
        description: `Sua conta foi temporariamente bloqueada. Tente novamente em ${remainingTime} minutos.`,
      });
      securityLogger.logBruteForce(loginData.email, loginAttempts.attemptCount);
      return;
    }

    const delay = loginAttempts.nextAttemptDelay;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const parsed = loginSchema.safeParse(loginData);
    if (!parsed.success) {
      setFieldErrorFromZod(parsed.error);
      securityLogger.logValidationError("email/password", "Validação básica falhou");
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(loginData.email, loginData.password);

      if (error) {
        loginAttempts.recordFailedAttempt();
        securityLogger.logLoginAttempt(loginData.email, false, error.message);
        toast({
          variant: "destructive",
          title: "Erro ao entrar",
          description: getFriendlyErrorMessage(error),
        });
        return;
      }

      if (rememberMe) {
        localStorage.setItem("remembered_email", loginData.email);
      } else {
        localStorage.removeItem("remembered_email");
      }
      loginAttempts.resetOnSuccess();
      securityLogger.logLoginAttempt(loginData.email, true);
      // O redirecionamento acontece automaticamente via useEffect acima
      // quando o AuthContext atualizar user + organizationsLoaded
    } catch (error) {
      loginAttempts.recordFailedAttempt();
      securityLogger.logLoginAttempt(loginData.email, false, String(error));
      toast({
        variant: "destructive",
        title: "Erro ao entrar",
        description: getFriendlyErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const now = Date.now();
    const timeSinceLastReset = now - lastResetTime;
    if (timeSinceLastReset < RESET_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESET_COOLDOWN_MS - timeSinceLastReset) / 1000);
      toast({
        variant: "destructive",
        title: "Aguarde",
        description: `Você já solicitou um reset recentemente. Tente novamente em ${remainingSeconds} segundos.`,
      });
      return;
    }

    const parsed = forgotPasswordSchema.safeParse({ email: forgotEmail });
    if (!parsed.success) {
      setFieldErrorFromZod(parsed.error);
      securityLogger.logValidationError("email", "Email inválido para reset");
      return;
    }

    setLoading(true);

    try {
      const { error } = await resetPassword(forgotEmail);

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro ao enviar email",
          description: getFriendlyErrorMessage(error),
        });
        securityLogger.logEvent({
          type: "password_reset_requested",
          email: forgotEmail,
          details: { error: error.message },
        });
        return;
      }

      setLastResetTime(now);
      localStorage.setItem("last_password_reset", now.toString());

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      securityLogger.logPasswordResetRequest(forgotEmail);
      switchMode("login");
      setForgotEmail("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao enviar email",
        description: "Ocorreu um erro. Tente novamente.",
      });
      securityLogger.logEvent({
        type: "password_reset_requested",
        email: forgotEmail,
        details: { error: String(error) },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen flex flex-col lg:flex-row bg-background relative overflow-x-hidden">
      {/* Background mobile */}
      <div className="lg:hidden absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        {loginBgUrl ? (
          <div className="relative w-full h-full">
            <img
              src={loginBgUrl.includes("supabase.co") ? `${loginBgUrl}?width=800&quality=60&format=webp` : loginBgUrl}
              alt=""
              className={`w-full h-full object-cover object-center transition-opacity duration-700 ${
                bgLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading="eager"
            />
            <div className="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-background via-background/90 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 via-background to-background" />
        )}
      </div>

      {/* Formulário de login */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col items-center justify-center px-8 py-8 lg:py-10 flex-shrink-0 mx-auto lg:ml-[100px] xl:ml-[100px] flex-1 lg:flex-none relative z-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-2 min-h-[56px] justify-center">
            {settingsLoading ? (
              <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
            ) : logoUrl ? (
              <img src={logoUrl} alt="Logo" width="160" height="56" className="h-14 w-auto mb-2" decoding="async" />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground text-center mb-6" aria-live="polite">
            {mode === "login" ? "Acesse seu sistema de gestão imobiliária" : "Recupere o acesso à sua conta"}
          </p>

          <div
            className={`transition-all duration-200 ease-in-out ${
              isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            }`}
          >
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                {loginAttempts.isLockedOut && (
                  <div
                    className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-destructive">
                      <p className="font-semibold">Temporariamente bloqueado</p>
                      <p>
                        Muitas tentativas. Tente novamente em{" "}
                        {Math.ceil(loginAttempts.remainingLockoutTime / 1000 / 60)} minutos.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="login-email" className="text-sm text-foreground">
                    Seu e-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      placeholder="seu@email.com"
                      autoComplete="username"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="h-11 rounded-xl bg-muted pl-11"
                      disabled={loginAttempts.isLockedOut}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "login-email-error" : undefined}
                    />
                  </div>
                  {errors.email && (
                    <p id="login-email-error" className="text-xs text-destructive mt-1" role="alert">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="login-password" className="text-sm text-foreground">
                      Sua senha
                    </Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      onKeyDown={handleCapsLock}
                      onKeyUp={handleCapsLock}
                      className="h-11 rounded-xl bg-muted pr-12"
                      disabled={loginAttempts.isLockedOut}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "login-password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={loginAttempts.isLockedOut}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="login-password-error" className="text-xs text-destructive mt-1" role="alert">
                      {errors.password}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setRememberMe(isChecked);
                          localStorage.setItem("remember_me", isChecked.toString());
                        }}
                      />
                      <label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer select-none">
                        Lembrar-me
                      </label>
                    </div>
                  </div>

                  {capsLockOn && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-warning">
                      <ShieldAlert size={14} />
                      <span>Caps Lock está ativado</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading || loginAttempts.isLockedOut}
                  className="w-full h-11 rounded-xl font-semibold uppercase tracking-wider text-xs"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>

                <div className="flex items-center justify-center gap-3 text-center">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    disabled={loginAttempts.isLockedOut}
                    className="text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    Esqueceu sua senha?
                  </button>
                  <span className="text-xs text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={() => navigate("/onboarding")}
                    disabled={loginAttempts.isLockedOut}
                    className="text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    Cadastre-se
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Voltar para login"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <span className="text-sm font-medium text-foreground">Recuperar senha</span>
                </div>

                <p className="text-sm text-muted-foreground">
                  Digite seu e-mail e enviaremos um link para redefinir sua senha.
                </p>

                <div>
                  <Label htmlFor="forgot-email" className="text-sm text-foreground">
                    Seu e-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      name="email"
                      type="email"
                      placeholder="seu@email.com"
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-11 rounded-xl bg-muted pl-11"
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "forgot-email-error" : undefined}
                    />
                  </div>
                  {errors.email && (
                    <p id="forgot-email-error" className="text-xs text-destructive mt-1" role="alert">
                      {errors.email}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-semibold uppercase tracking-wider text-xs"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar link de recuperação
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Painel direito - imagem de fundo (só desktop) */}
      <div className="hidden lg:block flex-1 relative bg-muted">
        {loginBgUrl && (
          <img
            src={loginBgUrl.includes("supabase.co") ? `${loginBgUrl}?width=1200&quality=70&format=webp` : loginBgUrl}
            alt=""
            aria-hidden="true"
            role="presentation"
            loading="eager"
            decoding="async"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              bgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        <div className="absolute inset-y-0 left-0 w-[400px] xl:w-[500px] bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
