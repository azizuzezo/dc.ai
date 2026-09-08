create table if not exists bot_knowledge (
  id bigint generated always as identity primary key,
  guild_id text not null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bot_knowledge_guild
  on bot_knowledge (guild_id, title);
