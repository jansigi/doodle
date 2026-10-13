-- Adds the configurable lineup per doodle (roles, people per celebration,
-- MD and singing rules). Doodles without a config keep the default lineup.
-- Run in the Supabase SQL editor if your tables were created before this.
alter table doodles add column if not exists config jsonb;
