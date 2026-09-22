alter table bot_donation_actions add column if not exists description text;

alter table bot_donation_events drop constraint if exists bot_donation_events_trigger_type_check;
alter table bot_donation_events add constraint bot_donation_events_trigger_type_check
  check (trigger_type in ('any_gift', 'specific_gift', 'follow', 'share', 'like_milestone', 'chat_keyword', 'gift_value_threshold'));
