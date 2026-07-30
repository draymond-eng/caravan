-- =============================================================================
-- Caravan - Supabase setup. Run once: Dashboard → SQL Editor → paste → Run.
--
-- Model: one row in `trips` per trip, identified by a short join code.
-- Every other table is scoped by that code (column `trip`).
-- No-auth friends-app policies: anyone with the join code can read/write
-- that trip's data. The code is unguessable; treat it like a shared secret.
-- =============================================================================

create table if not exists public.trips (
  code          text primary key,             -- join code, e.g. X7KQ2P
  name          text not null,                -- "Japan 2027"
  destination   text default '',              -- "Japan"
  start_date    text not null,
  end_date      text not null,
  tz            text default 'UTC',           -- destination timezone
  currency      text default 'USD',           -- destination currency code
  home_currency text default 'USD',
  travelers     jsonb not null default '[]',  -- [{id,name,color}]
  stops         jsonb not null default '[]',  -- [{id,label,nights}]
  gen_count     int default 0,                -- AI generations used
  chat_count    int default 0,                -- AI assistant messages used
  mode          text not null default 'trip', -- 'trip' | 'wedding'
  hosts         jsonb not null default '[]',  -- traveler ids who can edit (wedding mode)
  links         jsonb not null default '{}',  -- wedding links {roomblock,deadline,registry,site}
  created_at    timestamptz default now()
);

-- Migration for projects created before wedding mode (safe to re-run):
alter table public.trips add column if not exists mode  text  not null default 'trip';
alter table public.trips add column if not exists hosts jsonb not null default '[]';
alter table public.trips add column if not exists links jsonb not null default '{}';

-- AI-generated destination intel: guide cards + neighborhood cards
create table if not exists public.guides (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  kind       text not null,                   -- 'guide' | 'hood'
  stop       text default '',                 -- stop id for hoods
  emoji      text default '',
  title      text not null,
  tags       jsonb default '[]',
  body       text default '',
  base       text default '',                 -- hoods: "as a base" verdict
  created_at timestamptz default now()
);

create table if not exists public.days (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  date       text not null,
  stop       text default '',
  title      text not null,
  summary    text default '',
  meetup     text default '',
  items      jsonb not null default '[]',     -- [{time,type,title,note}]
  created_at timestamptz default now()
);
create index if not exists days_trip_idx on public.days (trip, date);

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  kind       text not null,                   -- decision | stay | idea | rsvp | booking
  topic      text not null,
  choice     text not null,
  voter      text not null,
  created_at timestamptz default now(),
  unique (trip, kind, topic, voter)
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip        text not null,
  label       text not null,
  amount      numeric not null,
  currency    text not null,
  paid_by     text not null,
  split_among text[] not null default '{}',
  created_at  timestamptz default now()
);

create table if not exists public.decisions (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  title      text not null,
  note       text default '',
  options    jsonb not null default '[]',
  status     text default 'open',
  author     text default '',
  created_at timestamptz default now()
);

create table if not exists public.stay_options (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  stop       text not null,
  name       text not null,
  tag        text default '',
  note       text default '',
  link       text default '',
  author     text default '',
  created_at timestamptz default now()
);

create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  title      text not null,
  note       text default '',
  tag        text default '',
  author     text default '',
  created_at timestamptz default now()
);

create table if not exists public.flights (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  traveler   text not null,
  dir        text not null,
  airline    text default '',
  flight_no  text default '',
  airport    text default '',
  date       text default '',
  time       text default '',
  note       text default '',
  created_at timestamptz default now(),
  unique (trip, traveler, dir)
);

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  list       text default 'note',
  text       text not null,
  done       boolean default false,
  author     text default '',
  created_at timestamptz default now()
);

create table if not exists public.confirmations (
  id              uuid primary key default gen_random_uuid(),
  trip            text not null,
  category        text default 'Other',
  label           text not null,
  confirmation_no text default '',
  url             text default '',
  path            text default '',
  author          text default '',
  created_at      timestamptz default now()
);

create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null,
  path       text not null,
  url        text not null,
  caption    text default '',
  author     text default '',
  created_at timestamptz default now()
);

-- ---- Open RLS (no-auth app; the join code is the secret) --------------------
do $$
declare t text;
begin
  foreach t in array array['trips','days','votes','expenses','decisions','stay_options','ideas','flights','notes','confirmations','photos','guides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "anon %s" on public.%I', t, t);
    execute format('create policy "anon %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- ---- Realtime ----------------------------------------------------------------
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.days;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.decisions;
alter publication supabase_realtime add table public.stay_options;
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.flights;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.confirmations;
alter publication supabase_realtime add table public.photos;
alter publication supabase_realtime add table public.guides;

-- ---- Storage bucket for photos + confirmation files -------------------------
insert into storage.buckets (id, name, public)
values ('caravan-files', 'caravan-files', true)
on conflict (id) do nothing;

drop policy if exists "caravan-files read"   on storage.objects;
drop policy if exists "caravan-files insert" on storage.objects;
drop policy if exists "caravan-files delete" on storage.objects;
create policy "caravan-files read"   on storage.objects for select using (bucket_id = 'caravan-files');
create policy "caravan-files insert" on storage.objects for insert with check (bucket_id = 'caravan-files');
create policy "caravan-files delete" on storage.objects for delete using (bucket_id = 'caravan-files');
