alter table bot_donation_settings add column if not exists chat_bubble_style jsonb not null default '{}'::jsonb;

create table if not exists bot_donation_alert_tiers (
  id bigint generated always as identity primary key,
  guild_id text not null,
  min_amount integer not null default 0,
  image_url text,
  effect text not null default 'none' check (effect in ('none', 'confetti', 'fireworks', 'shake', 'glow')),
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_alert_tiers_guild on bot_donation_alert_tiers (guild_id, min_amount desc);
