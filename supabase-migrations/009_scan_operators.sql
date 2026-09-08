create table if not exists bot_scan_operators (
  discord_user_id text primary key,
  added_by text,
  created_at timestamptz not null default now()
);
