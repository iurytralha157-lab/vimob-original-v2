import { GamificationSettings } from '@/components/gamification/GamificationSettings';
import { MissionManager } from '@/components/gamification/MissionManager';
import { ManualEntryForm } from '@/components/gamification/ManualEntryForm';
import { SeasonsManager } from '@/components/gamification/SeasonsManager';
import { GamificationParticipants } from '@/components/gamification/GamificationParticipants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Target, ClipboardCheck, Flag, Users } from 'lucide-react';

export default function GamificationAdmin() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Gestão de Gamificação</h2>
        <p className="text-muted-foreground">Configure regras, missões, temporadas e aprove lançamentos manuais.</p>
      </div>

      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            Regras de Pontuação
          </TabsTrigger>
          <TabsTrigger value="missions" className="gap-2">
            <Target className="h-4 w-4" />
            Missões
          </TabsTrigger>
          <TabsTrigger value="participants" className="gap-2">
            <Users className="h-4 w-4" />
            Participantes
          </TabsTrigger>
          <TabsTrigger value="seasons" className="gap-2">
            <Flag className="h-4 w-4" />
            Temporadas
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Aprovações Manuais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <GamificationSettings />
        </TabsContent>

        <TabsContent value="missions">
          <MissionManager />
        </TabsContent>

        <TabsContent value="participants">
          <GamificationParticipants />
        </TabsContent>

        <TabsContent value="seasons">
          <SeasonsManager />
        </TabsContent>

        <TabsContent value="manual">
          <ManualEntryForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
