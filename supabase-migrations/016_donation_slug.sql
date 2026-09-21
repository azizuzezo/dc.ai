alter table bot_donation_settings add column if not exists slug text unique;
alter table bot_donation_settings add column if not exists display_name text;
alter table bot_donation_settings add column if not exists description text;
