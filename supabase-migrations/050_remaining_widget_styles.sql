alter table bot_donation_settings add column if not exists actions_style jsonb not null default '{}'::jsonb;
alter table bot_donation_settings add column if not exists wheel_style jsonb not null default '{}'::jsonb;
alter table bot_donation_settings add column if not exists command_response_style jsonb not null default '{}'::jsonb;
alter table bot_donation_settings add column if not exists points_drop_style jsonb not null default '{}'::jsonb;
alter table bot_donation_settings add column if not exists link_preview_style jsonb not null default '{}'::jsonb;
alter table bot_donation_settings add column if not exists video_style jsonb not null default '{}'::jsonb;
