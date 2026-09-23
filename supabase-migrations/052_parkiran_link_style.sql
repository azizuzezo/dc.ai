alter table bot_donation_settings add column if not exists parkiran_link_style jsonb not null default '{}'::jsonb;
