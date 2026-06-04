import { AppLayout } from "@/components/layout/AppLayout";
import { MetaIntegrationSettings } from "@/components/integrations/MetaIntegrationSettings";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MetaSettings() {
  const { t } = useLanguage();
  const meta = t.settings.integrations.meta;

  return (
    <AppLayout title={meta.title}>
      <div className="space-y-4">
        <MetaIntegrationSettings />
      </div>
    </AppLayout>
  );
}
