import { useState, useEffect } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [selectedMembers, setSelectedMembers] = useState<MemberSelection[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: users = [] } = useUsers();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  useEffect(() => {
    if (team) {
      setName(team.name);
      setSelectedMembers(
        team.members?.map(m => ({
          userId: m.user_id,
          isLeader: m.is_leader || false,
        })) || []
      );
    } else {
      setName('');
      setSelectedMembers([]);
    }
  }, [team, open]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const abbreviateEmail = (email: string) => {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    const short = user.length > 6 ? user.slice(0, 6) + '…' : user;
    return `${short}@${domain}`;
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => {
      const exists = prev.find(m => m.userId === userId);
      if (exists) {
        return prev.filter(m => m.userId !== userId);
      }
      return [...prev, { userId, isLeader: false }];
    });
  };

  const toggleLeader = (userId: string) => {
    setSelectedMembers(prev =>
      prev.map(m =>
        m.userId === userId ? { ...m, isLeader: !m.isLeader } : m
      )
    );
  };

  const isMemberSelected = (userId: string) => {
    return selectedMembers.some(m => m.userId === userId);
  };

  const getMemberSelection = (userId: string) => {
    return selectedMembers.find(m => m.userId === userId);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome da equipe');
      return;
    }

    setIsSubmitting(true);

    try {
      if (team) {
        // Atualizar equipe existente
        await updateTeam.mutateAsync({
          id: team.id,
          name: name.trim(),
          memberIds: selectedMembers.map(m => m.userId),
        });

        // Atualizar líderes
        for (const member of selectedMembers) {
          await supabase
            .from('team_members')
            .update({ is_leader: member.isLeader })
            .eq('team_id', team.id)
            .eq('user_id', member.userId);
        }
      } else {
        // Criar nova equipe
        const result = await createTeam.mutateAsync({
          name: name.trim(),
          memberIds: selectedMembers.map(m => m.userId),
        });

        // Definir líderes
        for (const member of selectedMembers.filter(m => m.isLeader)) {
          await supabase
            .from('team_members')
            .update({ is_leader: true })
            .eq('team_id', result.id)
            .eq('user_id', member.userId);
        }
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving team:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-[650px] sm:max-w-[650px] p-6 flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{team ? 'Editar Equipe' : 'Nova Equipe'}</SheetTitle>
          <SheetDescription>
            {team
              ? 'Atualize as informações da equipe'
              : 'Crie uma nova equipe e adicione membros'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Equipe</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Equipe Vendas SP"
            />
          </div>

          <div className="space-y-2 overflow-hidden">
            <Label>Membros</Label>
            <ScrollArea className="h-64 border rounded-lg">
              <div className="space-y-2 p-2">
                {users.map((user) => {
                  const isSelected = isMemberSelected(user.id);
                  const memberData = getMemberSelection(user.id);

                  return (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-colors min-w-0 ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMember(user.id)}
                          className="shrink-0"
                        />
                        <div className="min-w-0 overflow-hidden">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{abbreviateEmail(user.email)}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <Crown
                            className={`h-4 w-4 transition-colors ${
                              memberData?.isLeader ? 'text-yellow-500' : 'text-muted-foreground/40'
                            }`}
                          />
                          <Switch
                            checked={memberData?.isLeader || false}
                            onCheckedChange={() => toggleLeader(user.id)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Ative o switch <Crown className="h-3 w-3 inline text-yellow-500" /> para definir como líder
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="w-[40%] rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="w-[60%] rounded-xl" onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {team ? 'Salvar' : 'Criar Equipe'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
