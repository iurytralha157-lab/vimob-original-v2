## Problema

Ao enviar onboarding, a edge function `submit-onboarding` falha com erro 500. Log mostra:

```
null value in column "organization_id" of relation "notifications" violates not-null constraint
```

A função `notify_superadmins_onboarding_request()` (trigger AFTER INSERT em `onboarding_requests`) insere em `public.notifications` sem `organization_id`. Como o onboarding ocorre antes da criação da organização, não há org_id para passar — e a coluna é NOT NULL.

## Solução

Atualizar a função `notify_superadmins_onboarding_request()` para usar o `organization_id` do próprio super admin (cada super admin pertence a alguma organização interna; usamos a dele para satisfazer a constraint, já que a notificação é pessoal dele):

```sql
CREATE OR REPLACE FUNCTION public.notify_superadmins_onboarding_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin record;
BEGIN
  INSERT INTO public.platform_events (type, severity, title, description, metadata)
  VALUES ('onboarding_requested', 'info', 'Nova solicitação de onboarding',
          NEW.company_name || ' (' || NEW.responsible_name || ')',
          jsonb_build_object('request_id', NEW.id, 'email', NEW.responsible_email));

  FOR v_admin IN
    SELECT id, organization_id
    FROM public.users
    WHERE role = 'super_admin' AND is_active = true AND organization_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, organization_id, type, title, content)
    VALUES (v_admin.id, v_admin.organization_id, 'onboarding_request',
            'Nova solicitação de onboarding',
            'A empresa ' || NEW.company_name || ' solicitou acesso.');
  END LOOP;
  RETURN NEW;
END;
$$;
```

Super admins sem `organization_id` são ignorados (não dá para satisfazer NOT NULL para eles, e a tela de admin pode ler via `platform_events` de qualquer forma).

## Entregáveis

- Migration `migrations/fix_notify_superadmins_onboarding.sql` com o `CREATE OR REPLACE FUNCTION` acima.

## Validação

- Reenviar o onboarding "Os Cariocas Na Paraiba Imoveis" e confirmar 200 da edge function.
- Conferir que aparece linha em `platform_events` e uma `notifications` por super admin com org.
