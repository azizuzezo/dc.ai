alter table bot_guild_settings
  add column if not exists disabled_commands text[] not null default '{}';
