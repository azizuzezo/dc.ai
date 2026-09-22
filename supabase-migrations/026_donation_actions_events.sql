create table if not exists bot_donation_actions (
  id bigint generated always as identity primary key,
  guild_id text not null,
  name text not null,
  media_url text,
  media_type text not null default 'image' check (media_type in ('image', 'gif', 'video', 'gift_icon')),
  gift_icon_key text,
  sound_url text,
  duration_ms integer not null default 4000,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_actions_guild on bot_donation_actions (guild_id);

create table if not exists bot_donation_events (
  id bigint generated always as identity primary key,
  guild_id text not null,
  action_id bigint not null references bot_donation_actions(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('any_gift', 'specific_gift', 'follow', 'share', 'like_milestone', 'chat_keyword')),
  trigger_value text,
  screen integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_events_guild on bot_donation_events (guild_id);

create table if not exists bot_donation_timers (
  id bigint generated always as identity primary key,
  guild_id text not null,
  action_id bigint not null references bot_donation_actions(id) on delete cascade,
  interval_minutes integer not null default 10,
  screen integer not null default 1,
  active boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_timers_guild on bot_donation_timers (guild_id);
