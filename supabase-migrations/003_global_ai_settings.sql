create table if not exists bot_global_ai_settings (
  id text primary key default 'default',
  ai_model text,
  ai_base_url text,
  ai_api_key text,
  updated_at timestamptz not null default now()
);
