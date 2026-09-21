create table if not exists bot_donation_wishlist_items (
  id bigint generated always as identity primary key,
  guild_id text not null,
  title text not null,
  target_amount integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_donation_wishlist_items_guild
  on bot_donation_wishlist_items (guild_id);

alter table bot_donations add column if not exists wishlist_item_id bigint references bot_donation_wishlist_items(id);
