-- Habilitar Realtime nas tabelas para notificações instantâneas
-- Isso fará as notificações aparecerem em ~100ms em vez de 30 segundos

-- Adicionar tabela notifications ao Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Adicionar tabela leads ao Realtime (para atualização instantânea do pipeline)
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Adicionar tabela stages ao Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stages;