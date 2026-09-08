create table if not exists bot_reminders (
  id bigint generated always as identity primary key,
  guild_id text not null,
  channel_id text not null,
  user_id text not null,
  message text not null,
  remind_at timestamptz not null,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_reminders_due
  on bot_reminders (remind_at) where not delivered;
