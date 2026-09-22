alter table bot_donation_settings add column if not exists moderation_enabled boolean not null default false;
alter table bot_donation_settings add column if not exists moderation_badwords_enabled boolean not null default true;
alter table bot_donation_settings add column if not exists moderation_judol_enabled boolean not null default true;
alter table bot_donation_settings add column if not exists moderation_duplicate_enabled boolean not null default true;
alter table bot_donation_settings add column if not exists link_preview_enabled boolean not null default false;

create table if not exists bot_donation_flagged_chat (
  id bigint generated always as identity primary key,
  guild_id text not null,
  tiktok_user text not null,
  message text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_flagged_chat_guild on bot_donation_flagged_chat (guild_id, created_at desc);
