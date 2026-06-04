create table if not exists chatbot_conversation_state (
	id bigserial primary key,
	organization_id uuid not null,
	conversation_id text not null,
	channel text not null default 'whatsapp',
	automation_enabled boolean not null default true,
	last_response_id text,
	agent_status text not null default 'pending',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (organization_id, conversation_id)
);

create table if not exists chatbot_inbound_messages (
	id bigserial primary key,
	organization_id uuid not null,
	conversation_id text not null,
	external_id text not null,
	channel text not null default 'whatsapp',
	from_number text,
	to_number text,
	body text,
	payload jsonb not null default '{}'::jsonb,
	received_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique (organization_id, channel, external_id)
);

create index if not exists idx_chatbot_inbound_conversation
	on chatbot_inbound_messages (organization_id, conversation_id, received_at desc);
