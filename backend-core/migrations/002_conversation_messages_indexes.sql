create index if not exists idx_conversation_messages_recent
  on conversation_messages (organization_id, conversation_id, created_at desc);
