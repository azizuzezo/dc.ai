alter table bot_donation_settings add column if not exists points_enabled boolean not null default false;
alter table bot_donation_settings add column if not exists points_currency_name text not null default 'Poin';
alter table bot_donation_settings add column if not exists points_per_coin numeric not null default 1;
alter table bot_donation_settings add column if not exists points_per_chat_message numeric not null default 0;
alter table bot_donation_settings add column if not exists points_per_follow numeric not null default 0;
alter table bot_donation_settings add column if not exists points_per_share numeric not null default 0;

create table if not exists bot_donation_points (
  guild_id text not null,
  tiktok_user text not null,
  points numeric not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (guild_id, tiktok_user)
);

create index if not exists idx_bot_donation_points_guild on bot_donation_points (guild_id);
