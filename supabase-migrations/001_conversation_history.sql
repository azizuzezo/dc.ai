create table if not exists bot_conversation_history (
  id bigint generated always as identity primary key,
  channel_id text not null,
  guild_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_conversation_history_channel
  on bot_conversation_history (channel_id, created_at desc);
