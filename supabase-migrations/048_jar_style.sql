alter table bot_donation_settings add column if not exists jar_style jsonb not null default '{}'::jsonb;
