create table if not exists bot_notes (
  id bigint generated always as identity primary key,
  guild_id text not null,
  author_id text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_notes_guild
  on bot_notes (guild_id, created_at desc);
