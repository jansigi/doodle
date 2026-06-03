-- Adds the per-month wish ("how often would you like to play at most").
-- Run in the Supabase SQL editor if your tables were created before this.
alter table participants add column if not exists max_per_month integer;
