alter table bot_donation_settings add column if not exists chat_commands_enabled boolean not null default false;
alter table bot_donation_settings add column if not exists chat_commands_config jsonb not null default '{}'::jsonb;
