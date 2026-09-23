create table if not exists bot_donation_milestones (
  id bigserial primary key,
  guild_id text not null,
  metric text not null default 'likes',
  target integer not null,
  label text not null default 'Goal',
  created_at timestamptz not null default now()
);
create index if not exists bot_donation_milestones_guild_id_idx on bot_donation_milestones (guild_id);
