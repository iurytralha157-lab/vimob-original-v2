/**
 * Utility to map technical Supabase error messages to user-friendly Portuguese messages.
 */
export function getFriendlyErrorMessage(error: any): string {
  if (!error) return 'Ocorreu um erro inesperado. Tente novamente.';

  const message = error.message || (typeof error === 'string' ? error : '');
  const lowerMessage = message.toLowerCase();

  // User creation / Auth errors
  if (lowerMessage.includes('user already exists') || lowerMessage.includes('already registered')) {
    return 'Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.';
  }
  
  if (lowerMessage.includes('invalid login credentials')) {
    return 'Credenciais inválidas. Verifique seus dados e tente novamente.';
  }

  if (lowerMessage.includes('email not confirmed')) {
    return 'Por favor, confirme seu e-mail antes de fazer login.';
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('once every 60 seconds')) {
    return 'Muitas solicitações em pouco tempo. Por favor, aguarde um minuto e tente novamente.';
  }

  if (lowerMessage.includes('email rate limit exceeded')) {
    return 'Limite de envio de e-mails atingido (limite do provedor). Tente novamente mais tarde ou entre em contato com o suporte.';
  }

  // Foreign Key / Deletion / Constraint errors
  if (lowerMessage.includes('violates foreign key constraint') || lowerMessage.includes('fk_')) {
    return 'Este registro não pode ser excluído pois está sendo utilizado em outras partes do sistema.';
  }

  // Removido caso especial de gamificação que causava confusão no fluxo de agendamento


  if (lowerMessage.includes('idempotency_key')) {
    return 'Erro técnico no banco de dados (trigger de gamificação). Por favor, informe ao suporte que a coluna idempotency_key está ausente.';
  }

  // Database / Connection errors
  if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('network error')) {
    return 'Erro de conexão. Verifique sua internet.';
  }

  // Permission errors
  if (lowerMessage.includes('insufficient_privilege') || lowerMessage.includes('permission denied')) {
    return 'Você não tem permissão para realizar esta ação (RLS Policy).';
  }

  // Specific check for SMTP/Email sending errors
  if (lowerMessage.includes('error sending') || lowerMessage.includes('535') || lowerMessage.includes('5.7.8')) {
    return 'Erro no servidor de e-mail. Verifique a configuração SMTP no painel do Supabase.';
  }

  // Fallback
  const isPortuguese = /[áéíóúãõç]/i.test(message) && !message.includes('error') && !message.includes('fail');
  
  return isPortuguese ? message : 'Ocorreu um erro ao processar sua solicitação. Tente novamente em alguns instantes.';
}
