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

-- =============================================================================
-- Push notifications + announcements (run this block on existing projects too)
-- =============================================================================
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null references public.trips(code) on delete cascade,
  title      text default '',
  body       text not null,
  author     text default '',
  created_at timestamptz default now()
);
create index if not exists announcements_trip_idx on public.announcements(trip);

create table if not exists public.push_subs (
  endpoint   text primary key,
  trip       text not null references public.trips(code) on delete cascade,
  voter      text default '',
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);
create index if not exists push_subs_trip_idx on public.push_subs(trip);

alter table public.announcements enable row level security;
alter table public.push_subs     enable row level security;
do $$ begin
  create policy "open announcements" on public.announcements for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "open push_subs" on public.push_subs for all using (true) with check (true);
exception when duplicate_object then null; end $$;

alter publication supabase_realtime add table public.announcements;

-- Home base (for the home clock and fare watching). Safe to re-run.
alter table public.trips add column if not exists home_city    text default '';
alter table public.trips add column if not exists home_airport text default '';
alter table public.trips add column if not exists home_tz      text default '';

-- Stays that are already booked (skip the voting round). Safe to re-run.
alter table public.stay_options add column if not exists booked  boolean default false;
alter table public.stay_options add column if not exists address text default '';
alter table public.stay_options add column if not exists conf    text default '';

-- Wedding lodging: room blocks are their own kind of stay row. Safe to re-run.
alter table public.stay_options add column if not exists kind     text default 'option'; -- option | block
alter table public.stay_options add column if not exists rate     text default '';
alter table public.stay_options add column if not exists deadline text default '';

-- Trip flavour (golf, ski, beach...), comments, and groupings. Safe to re-run.
alter table public.trips add column if not exists trip_type text default 'general';

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null references public.trips(code) on delete cascade,
  topic      text not null,            -- e.g. decision:<id>, idea:<id>, day:<id>
  author     text default '',
  body       text not null,
  created_at timestamptz default now()
);
create index if not exists comments_trip_idx on public.comments(trip, topic);

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null references public.trips(code) on delete cascade,
  set_name   text not null default '',  -- "Saturday foursomes"
  label      text not null default '',  -- "Group A"
  members    jsonb not null default '[]',
  note       text default '',
  sort       int default 0,
  created_at timestamptz default now()
);
create index if not exists groups_trip_idx on public.groups(trip);

alter table public.comments enable row level security;
alter table public.groups   enable row level security;
do $$ begin
  create policy "trip scoped" on public.comments for all
    using (trip = public.req_trip()) with check (trip = public.req_trip());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "trip scoped" on public.groups for all
    using (trip = public.req_trip()) with check (trip = public.req_trip());
exception when duplicate_object then null; end $$;

-- Cached map coordinates per place name. Safe to re-run.
alter table public.trips add column if not exists geo jsonb not null default '{}';

-- Fare watch: what people spot while shopping flights. Routes themselves live
-- on trips.links so adding one needs no migration. Safe to re-run.
create table if not exists public.fares (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null references public.trips(code) on delete cascade,
  route      text not null default '',   -- "DCA-TPA"
  price      numeric not null,
  note       text default '',
  author     text default '',
  created_at timestamptz default now()
);
create index if not exists fares_trip_idx on public.fares(trip, route);

alter table public.fares enable row level security;
do $$ begin
  create policy "trip scoped" on public.fares for all
    using (trip = public.req_trip()) with check (trip = public.req_trip());
exception when duplicate_object then null; end $$;

-- Wedding day-of operations: the run of show and the vendor list. Host-only in
-- the UI; kind separates them so one table serves both. Safe to re-run.
create table if not exists public.wedding_ops (
  id         uuid primary key default gen_random_uuid(),
  trip       text not null references public.trips(code) on delete cascade,
  kind       text not null default 'run',   -- 'run' = run of show, 'vendor'
  time       text default '',               -- 'HH:MM' for run items
  label      text not null default '',      -- what happens / vendor role
  who        text default '',               -- who it involves / vendor name
  phone      text default '',
  note       text default '',
  sort       int default 0,
  created_at timestamptz default now()
);
create index if not exists wedding_ops_trip_idx on public.wedding_ops(trip, kind);

alter table public.wedding_ops enable row level security;
do $$ begin
  create policy "trip scoped" on public.wedding_ops for all
    using (trip = public.req_trip()) with check (trip = public.req_trip());
exception when duplicate_object then null; end $$;
