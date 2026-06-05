import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, CreditCard } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { isBillingAccessRoute, isBillingBlockedStatus } from '@/lib/billing-access';

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'paid', 'confirmed'];
const ACTIVE_SUBSCRIPTION_TYPES = ['paid', 'free'];
type AccessBlockReason = 'trial' | 'billing';

export function TrialExpiredModal() {
  const { organization, isSuperAdmin, impersonating } = useAuth();
  const location = useLocation();
  const [isExpired, setIsExpired] = useState(false);
  const [blockReason, setBlockReason] = useState<AccessBlockReason>('trial');
  const [checkoutUrl, setCheckoutUrl] = useState('/settings?tab=subscription');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkTrialStatus = async () => {
      if (!organization?.id || isSuperAdmin || impersonating) {
        setLoading(false);
        return;
      }

      const { data: orgData } = await supabase
        .from('organizations')
        .select('subscription_status, subscription_type, trial_ends_at, checkout_token')
        .eq('id', organization.id)
        .single();

      if (orgData) {
        const subscriptionStatus = String(orgData.subscription_status || '').toLowerCase();
        const subscriptionType = String(orgData.subscription_type || '').toLowerCase();
        const hasActiveSubscription =
          ACTIVE_SUBSCRIPTION_STATUSES.includes(subscriptionStatus) ||
          ACTIVE_SUBSCRIPTION_TYPES.includes(subscriptionType);
        const isTrial = subscriptionType === 'trial';
        const trialEnded = orgData.trial_ends_at && new Date(orgData.trial_ends_at) < new Date();
        const isBillingBlocked = isBillingBlockedStatus(subscriptionStatus);

        setBlockReason(isBillingBlocked ? 'billing' : 'trial');
        setIsExpired(isBillingBlocked || (!hasActiveSubscription && isTrial && !!trialEnded));
        setCheckoutUrl(orgData.checkout_token ? `/checkout/${orgData.checkout_token}` : '/settings?tab=subscription');
      }

      setLoading(false);
    };

    checkTrialStatus();
  }, [organization?.id, isSuperAdmin, impersonating]);

  if (loading || isSuperAdmin || !isExpired || isBillingAccessRoute(location.pathname, location.search)) {
    return null;
  }

  const isBillingBlock = blockReason === 'billing';

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Clock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <DialogTitle className="text-xl">
            {isBillingBlock ? 'Pagamento pendente' : 'Seu período de avaliação expirou'}
          </DialogTitle>
          <DialogDescription className="pt-2 text-base">
            {isBillingBlock
              ? 'Identificamos uma pendência no faturamento da sua conta. Para continuar utilizando o Vimob, regularize sua assinatura.'
              : 'O período de avaliação gratuita chegou ao fim. Para continuar utilizando todas as funcionalidades, escolha uma forma de pagamento.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3">
          <a href={checkoutUrl}>
            <Button className="w-full gap-2">
              <CreditCard className="h-5 w-5" />
              Pagar assinatura
            </Button>
          </a>
          <p className="text-center text-sm text-muted-foreground">
            O acesso será liberado automaticamente após a confirmação do pagamento.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
