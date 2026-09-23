alter table bot_donations add column if not exists link_queue_content text;

create table if not exists bot_link_queue (
  id bigserial primary key,
  guild_id text not null,
  donor_name text not null,
  content text not null,
  amount numeric,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bot_link_queue_guild_id_idx on bot_link_queue (guild_id);
