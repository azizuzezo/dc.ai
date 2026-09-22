create table if not exists bot_donation_media (
  id bigint generated always as identity primary key,
  guild_id text not null,
  filename text not null,
  mime_type text not null,
  data text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_media_guild on bot_donation_media (guild_id);
