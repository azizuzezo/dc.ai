-- Dedup guard for @mention-triggered AI replies: a plain Discord message has
-- no single-winner ack the way slash-command interactions do, so if two bot
-- instances are briefly connected at once (e.g. during a Railway rolling
-- deploy), both would otherwise reply to the same mention. Claiming the
-- message's own (globally unique) id here before replying means only
-- whichever instance's insert wins actually sends a reply.
create table if not exists bot_processed_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_processed_messages_created_at on bot_processed_messages (created_at);
