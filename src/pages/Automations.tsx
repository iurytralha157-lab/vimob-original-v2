import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AnimatedTabNav, AnimatedTabItem } from "@/components/ui/animated-tab-nav";
import { AutomationList } from "@/components/automations/AutomationList";
import { FollowUpTemplates, FollowUpTemplate } from "@/components/automations/FollowUpTemplates";
import { FollowUpBuilder } from "@/components/automations/FollowUpBuilder";
import { FollowUpBuilderEdit } from "@/components/automations/FollowUpBuilderEdit";
import { ExecutionHistory } from "@/components/automations/ExecutionHistory";
import { LayoutGrid, Zap, History } from "lucide-react";
import { useAutomations } from "@/hooks/use-automations";

type ViewMode = "list" | "build-followup" | "edit-existing";

export default function Automations() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<FollowUpTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<string>("templates");
  const [historyAutomationId, setHistoryAutomationId] = useState<string | undefined>(undefined);
  const hasInitialized = useRef(false);
  const { data: automations } = useAutomations();

  // Muda para aba de automações apenas na primeira carga,
  // evitando redirecionar o usuário se ele navegar para outra aba depois
  useEffect(() => {
    if (!hasInitialized.current && automations && automations.length > 0) {
      setActiveTab("automations");
      hasInitialized.current = true;
    }
  }, [automations]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== "history") setHistoryAutomationId(undefined);
  };

  const handleEditAutomation = (automationId: string) => {
    setEditingAutomationId(automationId);
    setViewMode("edit-existing");
  };

  const handleSelectTemplate = (template: FollowUpTemplate | null) => {
    setSelectedTemplate(template);
    setViewMode("build-followup");
  };

  const handleComplete = () => {
    setViewMode("list");
    setActiveTab("automations");
    setSelectedTemplate(null);
    setEditingAutomationId(null);
  };

  const handleBack = () => {
    setViewMode("list");
    setEditingAutomationId(null);
    setSelectedTemplate(null);
  };

  const handleViewHistory = (automationId: string) => {
    setHistoryAutomationId(automationId);
    setActiveTab("history");
  };

  if (viewMode === "build-followup") {
    return (
      <AppLayout disableMainScroll>
        <div className="absolute inset-0 p-1.5 pt-0">
          <FollowUpBuilder initialTemplate={selectedTemplate} onBack={handleBack} onComplete={handleComplete} />
        </div>
      </AppLayout>
    );
  }

  if (viewMode === "edit-existing" && editingAutomationId) {
    return (
      <AppLayout disableMainScroll>
        <div className="absolute inset-0 p-1.5 pt-0">
          <FollowUpBuilderEdit automationId={editingAutomationId} onBack={handleBack} onComplete={handleComplete} />
        </div>
      </AppLayout>
    );
  }

  const tabs: AnimatedTabItem[] = [
    { value: "templates", label: "Modelos", icon: LayoutGrid },
    {
      value: "automations",
      label: "Minhas Automações",
      icon: Zap,
      badge: automations && automations.length > 0 ? automations.length : undefined,
    },
    { value: "history", label: "Histórico", icon: History },
  ];

  return (
    <AppLayout title="Automações">
      <div className="space-y-6 animate-in">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <AnimatedTabNav tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

          <TabsContent value="templates" className="mt-6">
            <FollowUpTemplates onSelectTemplate={handleSelectTemplate} />
          </TabsContent>

          <TabsContent value="automations" className="mt-6">
            <AutomationList onEdit={handleEditAutomation} onViewHistory={handleViewHistory} />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <ExecutionHistory automationId={historyAutomationId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
