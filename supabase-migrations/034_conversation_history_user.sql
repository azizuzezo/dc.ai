-- Adds per-user memory: the AI's conversational context is now built from a
-- person's own history (across every channel in the guild) instead of a
-- shared per-channel window that a busy channel's other messages would push
-- them out of. channel_id is kept as-is (still populated on every row) so
-- the admin "Conversations" viewer, which lists/reads transcripts per
-- channel, is unaffected.
alter table bot_conversation_history add column if not exists user_id text;

create index if not exists idx_bot_conversation_history_user
  on bot_conversation_history (guild_id, user_id, created_at desc);
