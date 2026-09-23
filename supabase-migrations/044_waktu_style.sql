alter table bot_donation_settings add column if not exists waktu_style jsonb not null default '{}'::jsonb;
