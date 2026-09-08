create table if not exists bot_guild_settings (
  guild_id text primary key,
  guild_name text,
  allowed_channel_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
