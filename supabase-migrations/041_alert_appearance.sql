alter table bot_donation_settings add column if not exists alert_appearance jsonb not null default '{}'::jsonb;
