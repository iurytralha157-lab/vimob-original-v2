update public.notification_templates
set
  message = 'Novo lead atribuido a voce

Lead: {lead_name}
Origem: {source}
Pipeline: {pipeline_name}

Acesse o CRM para atender esse lead.',
  variables = array['lead_name', 'source', 'pipeline_name'],
  updated_at = now()
where slug = 'lead_assigned_to_user';
