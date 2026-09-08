create table if not exists bot_user_warnings (
  id bigint generated always as identity primary key,
  guild_id text not null,
  user_id text not null,
  moderator_id text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_user_warnings_guild_user
  on bot_user_warnings (guild_id, user_id, created_at desc);
