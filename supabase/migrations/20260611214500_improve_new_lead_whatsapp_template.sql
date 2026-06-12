update public.notification_templates
set
  title = 'Novo lead',
  message = '🔔 NOVO LEAD
👤 Nome: {lead_name}
📱 Origem: {source}
🎯 Campanha: {campaign_name}
📅 Data: {lead_created_at}',
  variables = array['lead_name', 'source', 'campaign_name', 'lead_created_at']::text[]
where event_key = 'new_lead_received'
   or slug = 'new_lead_received';
