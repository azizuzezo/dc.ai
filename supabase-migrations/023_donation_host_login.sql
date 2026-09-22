alter table bot_donation_settings add column if not exists host_username text;
alter table bot_donation_settings add column if not exists host_password_hash text;
