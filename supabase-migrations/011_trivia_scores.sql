create table if not exists bot_trivia_scores (
  id bigint generated always as identity primary key,
  guild_id text not null,
  user_id text not null,
  correct_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (guild_id, user_id)
);

create index if not exists idx_bot_trivia_scores_guild
  on bot_trivia_scores (guild_id, correct_count desc);
