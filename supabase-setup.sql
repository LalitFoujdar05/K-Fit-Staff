-- Run this once in Supabase: SQL Editor, New query, paste, Run.
create table kv (key text primary key, value jsonb not null);
alter table kv enable row level security;  -- no public access; only your server (with the secret key) can read or write
