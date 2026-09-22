alter table bot_donation_settings add column if not exists subathon_end_at timestamptz;
alter table bot_donation_settings add column if not exists subathon_rate_amount integer not null default 10000;
alter table bot_donation_settings add column if not exists subathon_rate_minutes numeric not null default 5;
alter table bot_donation_settings alter column subathon_rate_minutes type numeric;
