import { useState } from 'react';
import { Users, Plus, Crown, MoreHorizontal, Pencil, Trash2, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TeamDialog } from '@/components/teams/TeamDialog';
import { MemberAvailabilityDialog } from '@/components/teams/MemberAvailabilityDialog';
import { useTeams, useDeleteTeam, Team } from '@/hooks/use-teams';
import { useTeamMembersAvailability, formatAvailabilitySummary } from '@/hooks/use-member-availability';

export function TeamsTab() {
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [availabilityMember, setAvailabilityMember] = useState<{
    id: string;
    name: string;
    avatar?: string | null;
  } | null>(null);

  const { data: teams = [], isLoading } = useTeams();
  const deleteTeam = useDeleteTeam();

  // Get all team member IDs for availability query
  const allMemberIds = teams.flatMap(t => t.members?.map(m => m.id) || []);
  const { data: allAvailability = [] } = useTeamMembersAvailability(allMemberIds);

  const getMemberAvailability = (memberId: string) => {
    return allAvailability.filter(a => a.team_member_id === memberId);
  };

  const handleEdit = (team: Team) => {
    setSelectedTeam(team);
    setTeamDialogOpen(true);
  };

  const handleDelete = (team: Team) => {
    setTeamToDelete(team);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (teamToDelete) {
      await deleteTeam.mutateAsync(teamToDelete.id);
      setDeleteDialogOpen(false);
      setTeamToDelete(null);
    }
  };

  const handleNewTeam = () => {
    setSelectedTeam(null);
    setTeamDialogOpen(true);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  // Count stats
  const totalMembers = teams.reduce((acc, t) => acc + (t.members?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Equipes</h2>
          <p className="text-sm text-muted-foreground">
            {teams.length} {teams.length === 1 ? 'equipe' : 'equipes'} · {totalMembers} {totalMembers === 1 ? 'membro' : 'membros'}
          </p>
        </div>
        <Button onClick={handleNewTeam} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Equipe
        </Button>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Crie sua primeira equipe</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Organize seus corretores em equipes e configure a disponibilidade de cada um
            </p>
            <Button onClick={handleNewTeam} size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Equipe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {teams.map((team) => {
            const leaders = (team.members || []).filter(m => m.is_leader);
            const regularMembers = (team.members || []).filter(m => !m.is_leader);
            
            return (
              <Card key={team.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                {/* Team Header */}
                <div className="p-4 bg-gradient-to-br from-primary/5 to-transparent border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{team.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">
                            {team.members?.length || 0} membros
                          </Badge>
                          {leaders.length > 0 && (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Crown className="h-3 w-3" />
                              <span className="text-xs">
                                {leaders.map(l => l.user?.name?.split(' ')[0]).join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(team)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(team)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Members List */}
                <CardContent className="p-0 px-4 md:px-6 pb-4">
                  <div className="divide-y">
                    {[...leaders, ...regularMembers].map((member) => {
                      const availability = getMemberAvailability(member.id);
                      const availabilitySummary = formatAvailabilitySummary(availability);
                      
                      return (
                        <div 
                          key={member.id} 
                          className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                              <AvatarImage src={member.user?.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {getInitials(member.user?.name || '?')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{member.user?.name}</span>
                                {member.is_leader && (
                                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                <Calendar className="h-3 w-3" />
                                <span>{availabilitySummary}</span>
                              </div>
                            </div>
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setAvailabilityMember({
                              id: member.id,
                              name: member.user?.name || '',
                              avatar: member.user?.avatar_url,
                            })}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            Escala
                          </Button>
                        </div>
                      );
                    })}
                    
                    {(team.members?.length || 0) === 0 && (
                      <div className="p-6 text-center text-muted-foreground">
                        <p className="text-sm">Nenhum membro na equipe</p>
                        <Button 
                          variant="link" 
                          size="sm" 
                          className="mt-1"
                          onClick={() => handleEdit(team)}
                        >
                          Adicionar membros
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Team Dialog */}
      <TeamDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        team={selectedTeam}
      />

      {/* Member Availability Dialog */}
      {availabilityMember && (
        <MemberAvailabilityDialog
          open={!!availabilityMember}
          onOpenChange={(open) => !open && setAvailabilityMember(null)}
          teamMemberId={availabilityMember.id}
          memberName={availabilityMember.name}
          memberAvatar={availabilityMember.avatar}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipe?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a equipe "{teamToDelete?.name}"?
              Esta ação não pode ser desfeita. Os membros serão removidos da equipe,
              mas suas contas permanecerão ativas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
