import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams } from '@/hooks/use-teams';

/**
 * Hook para verificar se o usuário pode editar cadências e pipelines
 * Retorna true se:
 * - Usuário é admin (role = 'admin')
 * - Usuário é líder de alguma equipe (is_leader = true)
 */
export function useCanEditCadences() {
  const { profile } = useAuth();
  const { data: teams = [] } = useTeams();

  const canEdit = useMemo(() => {
    // Admin sempre pode editar
    if (profile?.role === 'admin') return true;
    
    // Verificar se é líder de alguma equipe
    const isTeamLeader = teams.some(team => 
      team.members?.some(member => 
        member.user_id === profile?.id && member.is_leader
      )
    );
    
    return isTeamLeader;
  }, [profile, teams]);

  return canEdit;
}
