alter table public.chatbot_conversation_state
  add column if not exists context_reset_at timestamptz;

comment on column public.chatbot_conversation_state.context_reset_at is
  'When set, Jhenny ignores WhatsApp message history before this timestamp for AI context while preserving the actual message audit trail.';

alter table public.ai_agent_conversations
  add column if not exists context_reset_at timestamptz;

comment on column public.ai_agent_conversations.context_reset_at is
  'When set, legacy Jhenny responder ignores WhatsApp message history before this timestamp for AI context while preserving the actual message audit trail.';
