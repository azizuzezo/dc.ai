alter table bot_donation_settings add column if not exists subathon_started_at timestamptz;
alter table bot_donation_settings add column if not exists subathon_max_hours numeric;
