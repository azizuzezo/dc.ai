create table if not exists bot_tiktok_watches (
  id bigint generated always as identity primary key,
  guild_id text not null,
  channel_id text not null,
  tiktok_username text not null,
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  unique (guild_id, tiktok_username)
);
