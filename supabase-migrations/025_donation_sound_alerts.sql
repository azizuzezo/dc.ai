alter table bot_donation_settings add column if not exists sound_alert_map jsonb not null default '{}'::jsonb;
