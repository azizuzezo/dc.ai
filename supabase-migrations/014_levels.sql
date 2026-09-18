create table if not exists bot_levels (
  guild_id text not null,
  user_id text not null,
  xp bigint not null default 0,
  level integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
