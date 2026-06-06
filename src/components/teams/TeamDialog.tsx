import { useState, useEffect, useRef } from 'react';
import { Camera, Crown, Loader2, UserPlus, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useUsers } from '@/hooks/use-users';
import { useCreateTeam, useUpdateTeam, Team } from '@/hooks/use-teams';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: Team | null;
}

interface MemberSelection {
  userId: string;
  isLeader: boolean;
}

export function TeamDialog({ open, onOpenChange, team }: TeamDialogProps) {
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<MemberSelection[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: users = [] } = useUsers();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  useEffect(() => {
    if (team) {
      setName(team.name);
      setLogoUrl(team.logo_url || null);
      setSelectedMembers(
        team.members?.map((member) => ({
          userId: member.user_id,
          isLeader: member.is_leader || false,
        })) || []
      );
    } else {
      setName('');
      setLogoUrl(null);
      setSelectedMembers([]);
    }
    setLogoFile(null);
    setLogoPreview(null);
  }, [team, open]);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const getInitials = (value: string) =>
    value
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const isMemberSelected = (userId: string) => selectedMembers.some((member) => member.userId === userId);
  const getMemberSelection = (userId: string) => selectedMembers.find((member) => member.userId === userId);

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const exists = prev.find((member) => member.userId === userId);
      if (exists) return prev.filter((member) => member.userId !== userId);
      return [...prev, { userId, isLeader: false }];
    });
  };

  const toggleLeader = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.map((member) => (member.userId === userId ? { ...member, isLeader: !member.isLeader } : member))
    );
  };

  const uploadLogo = async () => {
    if (!logoFile) return logoUrl;

    const { data: authUser } = await supabase.auth.getUser();
    if (!authUser.user) throw new Error('Usuario nao autenticado');

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', authUser.user.id)
      .single();

    if (!profile?.organization_id) throw new Error('Organizacao nao encontrada');

    const extension = logoFile.name.split('.').pop() || 'webp';
    const path = `orgs/${profile.organization_id}/teams/${team?.id || crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage.from('logos').upload(path, logoFile, {
      cacheControl: '3600',
      upsert: true,
    });

    if (error) throw error;

    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome da equipe');
      return;
    }

    setIsSubmitting(true);

    try {
      const finalLogoUrl = await uploadLogo();

      if (team) {
        await updateTeam.mutateAsync({
          id: team.id,
          name: name.trim(),
          logo_url: finalLogoUrl || null,
          is_active: team.is_active ?? true,
          members: selectedMembers,
        });
      } else {
        await createTeam.mutateAsync({
          name: name.trim(),
          logo_url: finalLogoUrl || null,
          is_active: true,
          members: selectedMembers,
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving team:', error);
      toast.error('Erro ao salvar equipe');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayLogo = logoPreview || logoUrl || undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-hidden border-0 bg-black/82 p-0 text-white shadow-2xl backdrop-blur-xl sm:rounded-[20px] [&>button]:hidden">
        <div className="flex max-h-[88vh] flex-col p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">{team ? 'Editar equipe' : 'Nova equipe'}</h2>
            </div>
            <button
              type="button"
              className="rounded-full p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Avatar className="h-full w-full">
                  <AvatarImage src={displayLogo} />
                  <AvatarFallback className="bg-primary/20 text-sm text-primary">
                    {getInitials(name || 'Equipe')}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                  <Camera className="h-4 w-4" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
              />
              <div className="min-w-0 flex-1">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nome da equipe"
                  className="h-10 rounded-xl border-0 bg-white/10 text-white placeholder:text-white/45 focus-visible:ring-primary"
                />
                <p className="mt-1.5 text-xs text-white/45">
                  {selectedMembers.length} {selectedMembers.length === 1 ? 'membro selecionado' : 'membros selecionados'}
                </p>
              </div>
            </div>

            <ScrollArea className="min-h-[220px] flex-1 pr-2">
              <div className="space-y-1 pb-1">
                {users.map((user) => {
                  const isSelected = isMemberSelected(user.id);
                  const memberData = getMemberSelection(user.id);

                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-1.5 transition ${
                        isSelected ? 'bg-primary/14' : 'bg-white/8 hover:bg-white/12'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => toggleMember(user.id)}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                            {getInitials(user.name || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{user.name}</p>
                          <p className="truncate text-xs text-white/45">{user.email}</p>
                        </div>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition ${
                            isSelected ? 'bg-primary' : 'bg-white/12'
                          }`}
                        >
                          {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                      </button>

                      {isSelected && (
                        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-white/70">
                            <Crown className={`h-3.5 w-3.5 ${memberData?.isLeader ? 'text-amber-400' : 'text-white/35'}`} />
                            Lider
                          </div>
                          <Switch checked={memberData?.isLeader || false} onCheckedChange={() => toggleLeader(user.id)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              className="h-10 w-[30%] rounded-xl bg-white/10 text-white hover:bg-white/15"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-10 w-[70%] rounded-xl"
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {team ? 'Salvar' : 'Criar equipe'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
