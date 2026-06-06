import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Team {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  is_active?: boolean;
  logo_url?: string | null;
  created_by?: string | null;
  created_by_user?: { id: string; name: string | null; email?: string | null; avatar_url?: string | null } | null;
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

export interface TeamMemberInput {
  userId: string;
  isLeader?: boolean;
}

export function useTeams(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;

  return useQuery({
    queryKey: ['teams', { includeInactive }],
    queryFn: async () => {
      let query = supabase
        .from('teams')
        .select('*, created_by_user:users!teams_created_by_fkey(id, name, email, avatar_url)')
        .order('name');

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data: teams, error } = await query;
      if (error) throw error;

      if (!teams || teams.length === 0) return [];

      const teamIds = teams.map((team) => team.id);

      const { data: members } = await supabase
        .from('team_members')
        .select('*, user:users(id, name, avatar_url, email, is_active)')
        .in('team_id', teamIds);

      const membersWithLeader = (members || [])
        .filter((member) => member.user && (member.user as any).is_active !== false)
        .map((member) => ({
          ...member,
          is_leader: (member as any).is_leader ?? false,
        }));

      const membersByTeam = membersWithLeader.reduce((acc, member) => {
        if (!acc[member.team_id]) acc[member.team_id] = [];
        acc[member.team_id].push(member as TeamMember);
        return acc;
      }, {} as Record<string, TeamMember[]>);

      return teams.map((team) => ({
        ...team,
        is_active: (team as any).is_active ?? true,
        logo_url: (team as any).logo_url ?? null,
        created_by: (team as any).created_by ?? null,
        created_by_user: (team as any).created_by_user ?? null,
        members: membersByTeam[team.id] || [],
      })) as Team[];
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      memberIds?: string[];
      members?: TeamMemberInput[];
      logo_url?: string | null;
      is_active?: boolean;
    }) => {
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
          logo_url: data.logo_url || null,
          is_active: data.is_active ?? true,
          created_by: userData.user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const memberInputs = data.members || data.memberIds?.map((userId) => ({ userId })) || [];

      if (memberInputs.length > 0) {
        const membersToInsert = memberInputs.map((member) => ({
          team_id: team.id,
          user_id: member.userId,
          is_leader: member.isLeader ?? false,
        }));

        const { error: membersError } = await supabase.from('team_members').insert(membersToInsert as any);
        if (membersError) throw membersError;
      }

      return team as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['lead-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
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
    mutationFn: async ({
      id,
      name,
      memberIds,
      members,
      logo_url,
      is_active,
    }: {
      id: string;
      name?: string;
      memberIds?: string[];
      members?: TeamMemberInput[];
      logo_url?: string | null;
      is_active?: boolean;
    }) => {
      const teamUpdates: Record<string, unknown> = {};
      if (name !== undefined) teamUpdates.name = name;
      if (logo_url !== undefined) teamUpdates.logo_url = logo_url;
      if (is_active !== undefined) teamUpdates.is_active = is_active;

      if (Object.keys(teamUpdates).length > 0) {
        const { error } = await supabase
          .from('teams')
          .update(teamUpdates as any)
          .eq('id', id);

        if (error) throw error;
      }

      const memberInputs = members || memberIds?.map((userId) => ({ userId }));

      if (memberInputs !== undefined) {
        const memberLeadershipByUserId = new Map(
          memberInputs.map((member) => [member.userId, member.isLeader ?? false])
        );
        const normalizedMemberIds = Array.from(new Set(memberInputs.map((member) => member.userId)));

        const { data: currentMembers, error: currentMembersError } = await supabase
          .from('team_members')
          .select('id, user_id')
          .eq('team_id', id);

        if (currentMembersError) throw currentMembersError;

        const currentMemberIds = new Set((currentMembers || []).map((member) => member.user_id));
        const membersToRemove = (currentMembers || []).filter(
          (member) => !normalizedMemberIds.includes(member.user_id)
        );
        const membersToAdd = normalizedMemberIds.filter((userId) => !currentMemberIds.has(userId));

        if (membersToRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('team_members')
            .delete()
            .in('id', membersToRemove.map((member) => member.id));

          if (removeError) throw removeError;
        }

        if (membersToAdd.length > 0) {
          const membersToInsert = membersToAdd.map((userId) => ({
            team_id: id,
            user_id: userId,
            is_leader: memberLeadershipByUserId.get(userId) ?? false,
          }));

          const { error: insertError } = await supabase
            .from('team_members')
            .insert(membersToInsert as any);

          if (insertError) throw insertError;
        }

        for (const [userId, isLeader] of memberLeadershipByUserId.entries()) {
          const { error: leaderError } = await supabase
            .from('team_members')
            .update({ is_leader: isLeader } as any)
            .eq('team_id', id)
            .eq('user_id', userId);

          if (leaderError) throw leaderError;
        }

        await syncRoundRobinWithTeam(id, normalizedMemberIds);
      }

      return { id };
    },
    onSuccess: (_, variables) => {
      if (variables.members) {
        const leadershipByUserId = new Map(
          variables.members.map((member) => [member.userId, member.isLeader ?? false])
        );
        const selectedUserIds = new Set(variables.members.map((member) => member.userId));

        queryClient.setQueriesData<Team[]>({ queryKey: ['teams'] }, (cachedTeams) => {
          if (!cachedTeams) return cachedTeams;

          return cachedTeams.map((team) => {
            if (team.id !== variables.id) return team;

            return {
              ...team,
              name: variables.name ?? team.name,
              logo_url: variables.logo_url !== undefined ? variables.logo_url : team.logo_url,
              is_active: variables.is_active !== undefined ? variables.is_active : team.is_active,
              members: (team.members || [])
                .filter((member) => selectedUserIds.has(member.user_id))
                .map((member) => ({
                  ...member,
                  is_leader: leadershipByUserId.get(member.user_id) ?? false,
                })),
            };
          });
        });
      }

      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['lead-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Equipe atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar equipe: ' + error.message);
    },
  });
}

async function syncRoundRobinWithTeam(teamId: string, newMemberIds: string[]) {
  try {
    const { data: existingRRMembers } = await supabase
      .from('round_robin_members')
      .select('id, round_robin_id, user_id, position, weight')
      .eq('team_id', teamId);

    if (!existingRRMembers || existingRRMembers.length === 0) return;

    const byQueue = existingRRMembers.reduce((acc, member) => {
      if (!acc[member.round_robin_id]) acc[member.round_robin_id] = [];
      acc[member.round_robin_id].push(member);
      return acc;
    }, {} as Record<string, typeof existingRRMembers>);

    for (const [roundRobinId, currentMembers] of Object.entries(byQueue)) {
      const currentUserIds = currentMembers.map((member) => member.user_id);
      const toAdd = newMemberIds.filter((userId) => !currentUserIds.includes(userId));
      const toRemove = currentMembers.filter((member) => !newMemberIds.includes(member.user_id));

      if (toRemove.length > 0) {
        await supabase
          .from('round_robin_members')
          .delete()
          .in('id', toRemove.map((member) => member.id));
      }

      if (toAdd.length > 0) {
        const maxPos = Math.max(...currentMembers.map((member) => member.position ?? 0), -1);
        const defaultWeight = currentMembers[0]?.weight ?? 10;

        const newMembers = toAdd.map((userId, index) => ({
          round_robin_id: roundRobinId,
          user_id: userId,
          team_id: teamId,
          weight: defaultWeight,
          position: maxPos + 1 + index,
        }));

        await supabase.from('round_robin_members').insert(newMembers);
      }
    }
  } catch (err) {
    console.error('Error syncing round robin with team:', err);
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
      queryClient.invalidateQueries({ queryKey: ['lead-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      toast.success('Equipe excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir equipe: ' + error.message);
    },
  });
}

export function useUpdateTeamStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('teams')
        .update({ is_active } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Team;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['lead-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      toast.success(variables.is_active ? 'Equipe ativada!' : 'Equipe desativada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar equipe: ' + error.message);
    },
  });
}
