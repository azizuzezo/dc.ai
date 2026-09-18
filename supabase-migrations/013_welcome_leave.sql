alter table bot_guild_settings add column if not exists welcome_channel_id text;
alter table bot_guild_settings add column if not exists welcome_message text;
alter table bot_guild_settings add column if not exists leave_channel_id text;
alter table bot_guild_settings add column if not exists leave_message text;
