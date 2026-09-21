create table if not exists bot_donation_settings (
  guild_id text primary key,
  gateway_url text,
  gateway_api_key text,
  alert_channel_id text,
  overlay_token text not null unique,
  min_amount integer not null default 5000,
  tts_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  leaderboard_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists bot_donations (
  id bigint generated always as identity primary key,
  guild_id text not null,
  trx_id text not null unique,
  donor_name text not null default 'Anonim',
  message text,
  amount integer not null,
  status text not null default 'pending',
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donations_pending
  on bot_donations (guild_id) where status = 'pending';

create index if not exists idx_bot_donations_leaderboard
  on bot_donations (guild_id, amount desc) where status = 'paid';
