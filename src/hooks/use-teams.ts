import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Team {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  created_at: string;
  is_leader?: boolean;
  user?: { id: string; name: string; avatar_url: string | null; email?: string | null };
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data: teams, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (!teams || teams.length === 0) return [];
      
      const teamIds = teams.map(t => t.id);
      
      const { data: members } = await supabase
        .from('team_members')
        .select('*, user:users(id, name, avatar_url, email, is_active)')
        .in('team_id', teamIds);
      
      // Filter only active members and cast the result to include is_leader
      const membersWithLeader = (members || [])
        .filter(m => m.user && (m.user as any).is_active !== false)
        .map(m => ({
          ...m,
          is_leader: (m as any).is_leader ?? false,
        }));
      
      const membersByTeam = membersWithLeader.reduce((acc, m) => {
        if (!acc[m.team_id]) acc[m.team_id] = [];
        acc[m.team_id].push(m as TeamMember);
        return acc;
      }, {} as Record<string, TeamMember[]>);
      
      return teams.map(team => ({
        ...team,
        members: membersByTeam[team.id] || [],
      })) as Team[];
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; memberIds?: string[] }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Não autenticado');
      
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      const { data: team, error } = await supabase
        .from('teams')
        .insert({
          name: data.name,
          organization_id: profile.organization_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      if (data.memberIds && data.memberIds.length > 0) {
        const membersToInsert = data.memberIds.map(userId => ({
          team_id: team.id,
          user_id: userId,
        }));
        
        await supabase.from('team_members').insert(membersToInsert);
      }
      
      return team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Equipe criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar equipe: ' + error.message);
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, name, memberIds }: { id: string; name?: string; memberIds?: string[] }) => {
      if (name) {
        const { error } = await supabase
          .from('teams')
          .update({ name })
          .eq('id', id);
        
        if (error) throw error;
      }
      
      if (memberIds !== undefined) {
        const normalizedMemberIds = Array.from(new Set(memberIds));

        const { data: currentMembers, error: currentMembersError } = await supabase
          .from('team_members')
          .select('id, user_id')
          .eq('team_id', id);

        if (currentMembersError) throw currentMembersError;

        const currentMemberIds = new Set((currentMembers || []).map(member => member.user_id));
        const membersToRemove = (currentMembers || []).filter(
          member => !normalizedMemberIds.includes(member.user_id)
        );
        const membersToAdd = normalizedMemberIds.filter(userId => !currentMemberIds.has(userId));

        if (membersToRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('team_members')
            .delete()
            .in('id', membersToRemove.map(member => member.id));

          if (removeError) throw removeError;
        }

        if (membersToAdd.length > 0) {
          const membersToInsert = membersToAdd.map(userId => ({
            team_id: id,
            user_id: userId,
          }));

          const { error: insertError } = await supabase
            .from('team_members')
            .insert(membersToInsert);

          if (insertError) throw insertError;
        }

        // Sync round_robin_members for queues that use this team
        await syncRoundRobinWithTeam(id, normalizedMemberIds);
      }
      
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Equipe atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar equipe: ' + error.message);
    },
  });
}

/**
 * Sync round_robin_members when a team's membership changes.
 * For queues configured by team, adds new members and removes old ones.
 */
async function syncRoundRobinWithTeam(teamId: string, newMemberIds: string[]) {
  try {
    // Find all round_robin_members linked to this team
    const { data: existingRRMembers } = await supabase
      .from('round_robin_members')
      .select('id, round_robin_id, user_id, position, weight')
      .eq('team_id', teamId);

    if (!existingRRMembers || existingRRMembers.length === 0) {
      // No queues use this team - nothing to sync
      return;
    }

    // Group by round_robin_id
    const byQueue = existingRRMembers.reduce((acc, m) => {
      if (!acc[m.round_robin_id]) acc[m.round_robin_id] = [];
      acc[m.round_robin_id].push(m);
      return acc;
    }, {} as Record<string, typeof existingRRMembers>);

    for (const [roundRobinId, currentMembers] of Object.entries(byQueue)) {
      const currentUserIds = currentMembers.map(m => m.user_id);
      
      // Users to add (in team but not in queue)
      const toAdd = newMemberIds.filter(uid => !currentUserIds.includes(uid));
      
      // Users to remove (in queue but no longer in team)
      const toRemove = currentMembers.filter(m => !newMemberIds.includes(m.user_id));

      // Remove members no longer in team
      if (toRemove.length > 0) {
        await supabase
          .from('round_robin_members')
          .delete()
          .in('id', toRemove.map(m => m.id));
      }

      // Add new members
      if (toAdd.length > 0) {
        // Get max position
        const maxPos = Math.max(...currentMembers.map(m => m.position ?? 0), -1);
        const defaultWeight = currentMembers[0]?.weight ?? 10;

        const newMembers = toAdd.map((userId, idx) => ({
          round_robin_id: roundRobinId,
          user_id: userId,
          team_id: teamId,
          weight: defaultWeight,
          position: maxPos + 1 + idx,
        }));

        await supabase.from('round_robin_members').insert(newMembers);
      }

      if (toAdd.length > 0 || toRemove.length > 0) {
        console.log(`[sync] Queue ${roundRobinId}: added ${toAdd.length}, removed ${toRemove.length} members`);
      }
    }
  } catch (err) {
    console.error('Error syncing round robin with team:', err);
    // Non-blocking: don't fail the team update
  }
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Equipe excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir equipe: ' + error.message);
    },
  });
}
