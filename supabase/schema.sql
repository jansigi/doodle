-- Run this in the Supabase SQL editor (Database > SQL Editor) once.

create table doodles (
  id text primary key,
  title text not null,
  password_hash text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  dates jsonb not null,
  plan jsonb,
  warnings jsonb,
  created_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  doodle_id text not null references doodles (id) on delete cascade,
  name text not null,
  roles jsonb not null,
  can_md boolean not null default false,
  max_per_month integer,
  availability jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (doodle_id, name)
);

-- All access goes through the Next.js API routes using the service role key,
-- so row level security simply blocks direct anonymous access.
alter table doodles enable row level security;
alter table participants enable row level security;
