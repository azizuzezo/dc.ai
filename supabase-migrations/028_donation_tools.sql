alter table bot_donation_settings add column if not exists wheel_config jsonb not null default '[]'::jsonb;
alter table bot_donation_settings add column if not exists likeathon_reduction_enabled boolean not null default false;
alter table bot_donation_settings add column if not exists likeathon_reduction_percent numeric not null default 10;
alter table bot_donation_settings add column if not exists points_drop_bonus numeric not null default 50;
alter table bot_donation_settings add column if not exists points_drop_duration_seconds integer not null default 30;
alter table bot_donation_settings add column if not exists event_api_key text;
