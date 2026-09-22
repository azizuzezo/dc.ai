alter table bot_donation_settings add column if not exists dashboard_theme jsonb not null default '{}'::jsonb;
