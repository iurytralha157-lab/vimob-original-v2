
import { notificationService } from './src/services/NotificationService';

async function runTest() {
  const userId = "724d50ae-ef1c-4432-a254-0a8cf5d6a08d";
  const orgId = "010ec22e-29db-4906-8e1f-188ffabaa114";
  
  console.log('--- INICIANDO TESTE DE AUDITORIA ---');
  
  const result = await notificationService.send({
    templateSlug: 'test_audit_system',
    organizationId: orgId,
    userId: userId,
    variables: {
      user_name: 'Super Admin Teste'
    }
  });
  
  console.log('Resultado do envio:', JSON.stringify(result, null, 2));
  process.exit(0);
}

runTest().catch(err => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
