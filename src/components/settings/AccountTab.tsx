import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Camera,
  Copy,
  Loader2,
  Globe,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  Percent,
  Info,
  Mail,
  Pencil,
  X,
} from "lucide-react";
import { ImageCropper } from "@/components/ui/image-cropper";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePasswordChangeStatus } from "@/hooks/use-password-change-status";
import { usePasswordStrength, type PasswordStrength } from "@/hooks/use-password-strength";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Language, languageNames } from "@/i18n";

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

interface ProfileFormData {
  name: string;
  phone: string;
  whatsapp: string;
  cpf: string;
}

interface OrganizationFormData {
  name: string;
  cnpj: string;
  creci: string;
  inscricao_estadual: string;
  razao_social: string;
  nome_fantasia: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
  whatsapp: string;
  email: string;
  website: string;
  default_commission_percentage: string;
}

export function AccountTab() {
  const { profile, organization, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  // Profile states
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCpf, setShowCpf] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [avatarCropDialogOpen, setAvatarCropDialogOpen] = useState(false);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);

  // Organization states
  const [savingOrg, setSavingOrg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null);
  const [editingOrg, setEditingOrg] = useState(false);
  const isAdmin = profile?.role === "admin";

  const [profileForm, setProfileForm] = useState<ProfileFormData>({
    name: "",
    phone: "",
    whatsapp: "",
    cpf: "",
  });

  const [orgForm, setOrgForm] = useState<OrganizationFormData>({
    name: "",
    cnpj: "",
    creci: "",
    inscricao_estadual: "",
    razao_social: "",
    nome_fantasia: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    telefone: "",
    whatsapp: "",
    email: "",
    website: "",
    default_commission_percentage: "5",
  });

  const passwordStrength = usePasswordStrength(passwordData.newPassword);
  const passwordStatus = usePasswordChangeStatus(profile?.id);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.name || "",
        phone: profile.phone || "",
        whatsapp: profile.whatsapp || "",
        cpf: profile.cpf || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    if (organization) {
      setOrgForm({
        name: organization.name || "",
        cnpj: organization.cnpj || "",
        creci: organization.creci || "",
        inscricao_estadual: organization.inscricao_estadual || "",
        razao_social: organization.razao_social || "",
        nome_fantasia: organization.nome_fantasia || "",
        cep: organization.cep || "",
        endereco: organization.endereco || "",
        numero: organization.numero || "",
        complemento: organization.complemento || "",
        bairro: organization.bairro || "",
        cidade: organization.cidade || "",
        uf: organization.uf || "",
        telefone: organization.telefone || "",
        whatsapp: organization.whatsapp || "",
        email: organization.email || "",
        website: organization.website || "",
        default_commission_percentage: String(organization.default_commission_percentage || 5),
      });
    }
  }, [organization]);

  const uploadAvatarBlob = async (blob: Blob) => {
    if (!profile?.id) return;
    setUploadingAvatar(true);
    try {
      const fileName = `${profile.id}-${Date.now()}.png`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, blob, {
        contentType: "image/png",
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      await refreshProfile();
      toast.success(t.settings.profile.saveSuccess);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error(t.settings.profile.saveError);
    } finally {
      setUploadingAvatar(false);
      setPendingAvatarUrl(null);
    }
  };

  const handleUploadAvatar = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingAvatarUrl(reader.result as string);
      setAvatarCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onAvatarCropComplete = async (blob: Blob) => {
    setAvatarCropDialogOpen(false);
    await uploadAvatarBlob(blob);
  };

  const handleSaveProfile = async () => {
    if (!profile?.id) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: profileForm.name.trim() || profile.name,
          phone: profileForm.phone || null,
          whatsapp: profileForm.whatsapp || null,
          cpf: profileForm.cpf || null,
        })
        .eq("id", profile.id);

      if (error) throw error;
      await refreshProfile();
      toast.success(t.settings.profile.saveSuccess);
      setEditingProfile(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error(t.settings.profile.saveError);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!organization?.id || !isAdmin) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgForm.name,
          cnpj: orgForm.cnpj || null,
          creci: orgForm.creci || null,
          inscricao_estadual: orgForm.inscricao_estadual || null,
          razao_social: orgForm.razao_social || null,
          nome_fantasia: orgForm.nome_fantasia || null,
          cep: orgForm.cep || null,
          endereco: orgForm.endereco || null,
          numero: orgForm.numero || null,
          complemento: orgForm.complemento || null,
          bairro: orgForm.bairro || null,
          cidade: orgForm.cidade || null,
          uf: orgForm.uf || null,
          telefone: orgForm.telefone || null,
          whatsapp: orgForm.whatsapp || null,
          email: orgForm.email || null,
          website: orgForm.website || null,
          default_commission_percentage: parseFloat(orgForm.default_commission_percentage) || 5,
        })
        .eq("id", organization.id);

      if (error) throw error;
      await refreshProfile();
      toast.success(t.settings.organization.saveSuccess);
      setEditingOrg(false);
    } catch (error) {
      console.error("Error saving organization:", error);
      toast.error(t.settings.organization.saveError);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingLogoUrl(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  // ✅ CORRIGIDO: path agora usa subpasta 'organizations' que é permitida pela policy
  const onCropComplete = async (blob: Blob) => {
    if (!organization?.id) return;
    setCropDialogOpen(false);
    setUploadingLogo(true);
    try {
      const path = `organizations/${organization.id}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("logos").upload(path, blob);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("logos").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl })
        .eq("id", organization.id);
      if (updateError) throw updateError;

      await refreshProfile();
      toast.success("Logo atualizada com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao salvar logo: " + error.message);
    } finally {
      setUploadingLogo(false);
      setPendingLogoUrl(null);
    }
  };

  const handleChangePassword = async () => {
    if (passwordStatus.isLocked) {
      toast.error(`Por seguranca, nova alteracao disponivel em ${passwordStatus.remainingText}.`);
      return;
    }
    if (!passwordStrength.isValid) {
      toast.error("A senha nao atende aos criterios minimos de seguranca");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("As senhas nao coincidem");
      return;
    }

    setChangingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-password", {
        body: {
          password: passwordData.newPassword,
          source: "settings",
        },
      });
      if (error) throw error;
      if (data?.allowed === false) {
        toast.error(data.message || "Nao foi possivel alterar a senha agora.");
        await passwordStatus.refetch();
        return;
      }
      toast.success(data?.message || "Senha alterada com sucesso!");
      setPasswordData({ newPassword: "", confirmPassword: "" });
      setEditingPassword(false);
      await passwordStatus.refetch();
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast.error(error.message || "Erro ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLanguageChange = async (lang: string) => {
    await setLanguage(lang as Language);
    toast.success(t.settings.profile.saveSuccess);
  };

  const copyValue = async (value?: string | null) => {
    if (!value) {
      toast.error("Nenhuma informação para copiar");
      return;
    }
    await navigator.clipboard.writeText(value);
    toast.success("Copiado para a área de transferência");
  };

  const maskCpf = (value?: string | null) => {
    if (!value) return "Não informado";
    if (showCpf) return value;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 4) return "••••";
    return `•••.•••.•••-${digits.slice(-2)}`;
  };

  const restoreProfileForm = () => {
    setProfileForm({
      name: profile?.name || "",
      phone: profile?.phone || "",
      whatsapp: profile?.whatsapp || "",
      cpf: profile?.cpf || "",
    });
    setEditingProfile(false);
  };

  const restoreOrgForm = () => {
    setOrgForm({
      name: organization?.name || "",
      cnpj: organization?.cnpj || "",
      creci: organization?.creci || "",
      inscricao_estadual: organization?.inscricao_estadual || "",
      razao_social: organization?.razao_social || "",
      nome_fantasia: organization?.nome_fantasia || "",
      cep: organization?.cep || "",
      endereco: organization?.endereco || "",
      numero: organization?.numero || "",
      complemento: organization?.complemento || "",
      bairro: organization?.bairro || "",
      cidade: organization?.cidade || "",
      uf: organization?.uf || "",
      telefone: organization?.telefone || "",
      whatsapp: organization?.whatsapp || "",
      email: organization?.email || "",
      website: organization?.website || "",
      default_commission_percentage: String(organization?.default_commission_percentage || 5),
    });
    setEditingOrg(false);
  };

  const formatEmpty = (value?: string | null) => value?.trim() || "Não informado";
  const roleLabel = profile?.role === "admin" ? t.settings.users.admin : t.settings.users.user;
  const passwordMismatch = !!passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword;
  const isPasswordSubmitDisabled =
    changingPassword ||
    passwordStatus.isLocked ||
    !passwordData.newPassword ||
    !passwordData.confirmPassword ||
    !passwordStrength.isValid ||
    passwordMismatch;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-6">
        {/* LEFT: Profile Card */}
        <Card className="h-fit lg:col-start-1 lg:row-start-1">
          <CardHeader className="px-4 md:px-5 pt-5 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">Meu perfil</CardTitle>
                <CardDescription className="mt-0.5 text-sm text-muted-foreground">Dados pessoais e informações de contato.</CardDescription>
              </div>
              <Button
                variant={editingProfile ? "ghost" : "outline"}
                size="sm"
                className={editingProfile ? "h-8 gap-2" : "h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"}
                onClick={editingProfile ? restoreProfileForm : () => setEditingProfile(true)}
              >
                {editingProfile ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editingProfile ? "Cancelar" : "Editar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-4 md:px-5 pb-5">
            {/* Avatar Upload */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {profile?.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadAvatar(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                  onClick={() => document.getElementById("avatar-upload")?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                </Button>
              </div>

              {avatarCropDialogOpen && pendingAvatarUrl && (
                <ImageCropper
                  imageSrc={pendingAvatarUrl}
                  title="Ajustar foto do perfil"
                  circularCrop
                  onCropComplete={onAvatarCropComplete}
                  onCancel={() => {
                    setAvatarCropDialogOpen(false);
                    setPendingAvatarUrl(null);
                  }}
                />
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{profile?.name}</h3>
                  <Badge variant="secondary">{roleLabel}</Badge>
                </div>
                <div className="mt-1 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{profile?.email}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <WhatsAppGlyph className="h-3.5 w-3.5 shrink-0 text-[#25D366]" />
                    <span className="truncate">{formatEmpty(profileForm.whatsapp)}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex flex-col gap-2 pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4" />
                {t.settings.profile.language}
              </Label>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">{languageNames["pt-BR"]}</SelectItem>
                  <SelectItem value="en">{languageNames["en"]}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Personal Info */}
            {editingProfile && <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t.settings.profile.personalInfo}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.common.name}</Label>
                  <Input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={!editingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.cpf}</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="000.000.000-00"
                      value={editingProfile ? profileForm.cpf : maskCpf(profileForm.cpf)}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, cpf: e.target.value }))}
                      disabled={!editingProfile}
                      className="pr-20"
                    />
                    {!editingProfile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-9 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => copyValue(profileForm.cpf)}
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCpf(!showCpf)}
                    >
                      {showCpf ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>}

            {/* Contact Info */}
            {editingProfile && <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t.settings.profile.contactInfo}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.common.phone}</Label>
                  <PhoneInput
                    value={profileForm.phone}
                    onChange={(value) => setProfileForm((prev) => ({ ...prev, phone: value }))}
                    disabled={!editingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.whatsapp}</Label>
                  <PhoneInput
                    value={profileForm.whatsapp}
                    onChange={(value) => setProfileForm((prev) => ({ ...prev, whatsapp: value }))}
                    disabled={!editingProfile}
                  />
                </div>
              </div>
              {!editingProfile && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => copyValue(profileForm.phone)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar telefone
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => copyValue(profileForm.whatsapp)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar WhatsApp
                  </Button>
                </div>
              )}
            </div>}

            {/* Save Button */}
            {editingProfile && <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t.common.save}
              </Button>
            </div>}
          </CardContent>
        </Card>

        <Card className="h-fit">
        <CardContent className="p-4 md:p-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h4 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Senha
                </h4>
                {!editingPassword && (
                  <p className="text-sm text-muted-foreground">
                    Sua senha fica protegida e so abre quando voce escolher atualizar.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{passwordStatus.lastChangeText}</p>
                {passwordStatus.isLocked && (
                  <p className="text-xs text-destructive">
                    Por seguranca, nova alteracao disponivel em {passwordStatus.remainingText}.
                  </p>
                )}
              </div>
              <Button
                variant={editingPassword ? "outline" : "default"}
                size="sm"
                className="h-8 gap-2 self-start sm:self-auto"
                onClick={() => {
                  setEditingPassword((value) => !value);
                  setPasswordData({ newPassword: "", confirmPassword: "" });
                }}
                disabled={passwordStatus.isLocked && !editingPassword}
              >
                {editingPassword ? <X className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                {editingPassword ? "Cancelar" : "Atualizar senha"}
              </Button>
            </div>

            {editingPassword && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nova senha</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Minimo 8 caracteres"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                      className="pr-10 h-9"
                      disabled={passwordStatus.isLocked}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordData.newPassword && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= passwordStrength.score ? STRENGTH_COLORS[passwordStrength.level] : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Forca: <span className="font-medium">{STRENGTH_LABELS[passwordStrength.level]}</span>
                      </p>
                      {!passwordStrength.isValid && (
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {passwordStrength.feedback.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirme a senha"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="pr-10 h-9"
                      disabled={passwordStatus.isLocked}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordMismatch && <p className="text-xs text-destructive">As senhas nao coincidem</p>}
                </div>
              </div>
            )}

            {editingPassword && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {passwordStatus.isLocked
                    ? `Bloqueado por ${passwordStatus.remainingText}`
                    : "Use uma senha boa ou forte para atualizar."}
                </p>
                <Button
                  size="sm"
                  onClick={handleChangePassword}
                  disabled={isPasswordSubmitDisabled}
                  className="h-8"
                >
                  {changingPassword && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                  Atualizar senha
                </Button>
              </div>
            )}
          </div>
        </CardContent>
        </Card>
        </div>

        {/* RIGHT: Organization Card */}
        <Card className="h-fit">
          <CardHeader className="px-4 md:px-5 pt-5 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">Dados da empresa</CardTitle>
                <CardDescription className="mt-0.5 text-sm text-muted-foreground">Informações fiscais, endereço e contato da organização.</CardDescription>
              </div>
              {isAdmin && (
                <Button
                  variant={editingOrg ? "ghost" : "outline"}
                  size="sm"
                  className={editingOrg ? "h-8 gap-2" : "h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"}
                  onClick={editingOrg ? restoreOrgForm : () => setEditingOrg(true)}
                >
                  {editingOrg ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editingOrg ? "Cancelar" : "Editar"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-4 md:px-5 pb-5">
            {/* Organization Logo Upload */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="h-20 w-20 rounded-full border flex items-center justify-center bg-muted/30 overflow-hidden">
                    {organization?.logo_url ? (
                      <img src={organization.logo_url} className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  {isAdmin && (
                    <input
                      id="org-logo-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadLogo(file);
                        e.target.value = "";
                      }}
                    />
                  )}
                  {uploadingLogo && (
                    <div className="absolute inset-0 rounded-full bg-background/80 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                      onClick={() => document.getElementById("org-logo-upload")?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium truncate">{formatEmpty(orgForm.name)}</h3>
                  <p className="text-sm text-muted-foreground">CNPJ: {formatEmpty(orgForm.cnpj)}</p>
                  <p className="text-sm text-muted-foreground">CRECI: {formatEmpty(orgForm.creci)}</p>
                </div>
              </div>
            </div>

            {cropDialogOpen && pendingLogoUrl && (
              <ImageCropper
                imageSrc={pendingLogoUrl}
                title="Ajustar logo"
                onCropComplete={onCropComplete}
                onCancel={() => {
                  setCropDialogOpen(false);
                  setPendingLogoUrl(null);
                }}
              />
            )}

            {/* Company Name */}
            {editingOrg && <div className="space-y-1.5">
              <Label className="text-xs">{t.settings.organization.companyName}</Label>
              <Input
                value={orgForm.name}
                onChange={(e) => setOrgForm((prev) => ({ ...prev, name: e.target.value }))}
                disabled={!isAdmin || !editingOrg}
              />
            </div>}

            {/* Fiscal Data */}
            {editingOrg && <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t.settings.organization.fiscalData}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.organization.cnpj}</Label>
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={orgForm.cnpj}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.organization.stateRegistration}</Label>
                  <Input
                    value={orgForm.inscricao_estadual}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, inscricao_estadual: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CRECI</Label>
                  <Input
                    placeholder="12345-F"
                    value={orgForm.creci}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, creci: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.organization.legalName}</Label>
                  <Input
                    value={orgForm.razao_social}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, razao_social: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.organization.tradeName}</Label>
                  <Input
                    value={orgForm.nome_fantasia}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, nome_fantasia: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
              </div>
            </div>}

            {/* Address */}
            {editingOrg && <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t.settings.organization.address}</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.cep}</Label>
                  <Input
                    placeholder="00000-000"
                    value={orgForm.cep}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, cep: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">{t.settings.profile.street}</Label>
                  <Input
                    value={orgForm.endereco}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, endereco: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.number}</Label>
                  <Input
                    value={orgForm.numero}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, numero: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.complement}</Label>
                  <Input
                    value={orgForm.complemento}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, complemento: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.neighborhood}</Label>
                  <Input
                    value={orgForm.bairro}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, bairro: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">{t.settings.profile.city}</Label>
                  <Input
                    value={orgForm.cidade}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, cidade: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.state}</Label>
                  <Input
                    maxLength={2}
                    value={orgForm.uf}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, uf: e.target.value.toUpperCase() }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
              </div>
            </div>}

            {/* Contact */}
            {editingOrg && <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t.settings.organization.contact}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.common.phone}</Label>
                  <Input
                    placeholder="(00) 0000-0000"
                    value={orgForm.telefone}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, telefone: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.profile.whatsapp}</Label>
                  <Input
                    placeholder="(00) 00000-0000"
                    value={orgForm.whatsapp}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.common.email}</Label>
                  <Input
                    placeholder="contato@empresa.com"
                    value={orgForm.email}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.settings.organization.website}</Label>
                  <Input
                    placeholder="https://www.empresa.com"
                    value={orgForm.website}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, website: e.target.value }))}
                    disabled={!isAdmin || !editingOrg}
                  />
                </div>
              </div>
            </div>}

            {/* Financial Settings */}
            {isAdmin && <div className="space-y-3 pt-4 border-t">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Configurações Financeiras
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Este percentual será usado como padrão para cálculo de comissões.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h4>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Label className="flex items-center gap-2 text-xs whitespace-nowrap">
                    <Percent className="h-3 w-3" />
                    Comissão Padrão (%)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="5"
                    value={orgForm.default_commission_percentage}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, default_commission_percentage: e.target.value }))}
                    disabled={!isAdmin}
                    className="w-full sm:w-24 h-9"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveOrganization}
                    disabled={savingOrg || !orgForm.name.trim()}
                    className="h-9 gap-2"
                  >
                    {savingOrg && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </div>}

            {/* Save Button */}
            {isAdmin && editingOrg && (
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSaveOrganization} disabled={savingOrg || !orgForm.name.trim()}>
                  {savingOrg && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t.common.save}
                </Button>
              </div>
            )}

            {!isAdmin && (
              <p className="text-xs text-muted-foreground pt-4 border-t">
                Apenas administradores podem editar os dados da empresa.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.53 0 .2 5.33.2 11.88c0 2.09.55 4.14 1.6 5.94L0 24l6.32-1.66a11.84 11.84 0 0 0 5.76 1.47h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.17-1.24-6.15-3.45-8.45ZM12.09 21.8h-.01a9.88 9.88 0 0 1-5.04-1.38l-.36-.21-3.75.98 1-3.65-.24-.37a9.82 9.82 0 0 1-1.5-5.29c0-5.45 4.44-9.89 9.9-9.89a9.83 9.83 0 0 1 6.99 2.9 9.84 9.84 0 0 1 2.9 7c0 5.46-4.44 9.91-9.89 9.91Zm5.42-7.41c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

