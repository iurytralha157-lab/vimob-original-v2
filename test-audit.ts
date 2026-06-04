
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

// Minimal version of NotificationService logic for the test script
async function logNotification(log: any) {
  try {
    const { error } = await supabase.from('notification_logs' as any).insert({
      template_id: log.templateId,
      organization_id: log.organizationId,
      user_id: log.userId,
      recipient: log.recipient,
      channel: log.channel,
      payload: log.payload,
      response: log.response,
      status: log.status,
      error: log.error
    });
    if (error) console.error('Error inserting log:', error);
    else console.log('✅ Log inserido com sucesso!');
  } catch (err) {
    console.error('Failed to log notification:', err);
  }
}

async function runTest() {
  const userId = "724d50ae-ef1c-4432-a254-0a8cf5d6a08d";
  const orgId = "010ec22e-29db-4906-8e1f-188ffabaa114";
  
  console.log('--- INICIANDO TESTE DE AUDITORIA (SIMULAÇÃO SERVICE) ---');
  
  // 1. Fetch template simulation
  const { data: template } = await supabase
    .from('notification_templates' as any)
    .select('*')
    .eq('slug', 'test_audit_system')
    .single();
    
  if (!template) {
    console.error('Template test_audit_system não encontrado');
    process.exit(1);
  }
  
  console.log('Template encontrado:', template.name);

  // 2. Format simulation
  const formattedTitle = template.title.replace('{user_name}', 'Super Admin Teste');
  const formattedMessage = template.message.replace('{user_name}', 'Super Admin Teste');

  // 3. System dispatch simulation
  const { data: insertData, error: notifError } = await supabase.from('notifications').insert({
    user_id: userId,
    organization_id: orgId,
    title: formattedTitle,
    content: formattedMessage,
    type: template.category || 'info',
    is_read: false,
  }).select().single();
  
  const result = { success: !notifError, data: insertData, error: notifError };
  console.log('Simulação de envio concluída.');

  // 4. Log simulation
  const startTime = Date.now();
  await logNotification({
    templateId: template.id,
    organizationId: orgId,
    userId: userId,
    recipient: userId,
    channel: template.channel,
    payload: { 
      variables: { user_name: 'Super Admin Teste' }, 
      formattedTitle, 
      formattedMessage,
      origin: 'AuditTestScript',
      executionTime: `${(Date.now() - startTime).toFixed(2)}ms`
    },
    response: result,
    status: result.success ? 'sent' : 'failed',
    error: result.error ? JSON.stringify(result.error) : null
  });
  
  console.log('--- TESTE CONCLUÍDO ---');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
