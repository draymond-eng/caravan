-- =============================================================================
-- SquadTrip - privacy lockdown.
-- Before this, row-level security allowed anything, so anyone with the public
-- key could read every trip in the database. After this, a request can only
-- see rows for the trip code it presents in the x-trip-code header, which the
-- app sets from the URL. Knowing the code is what grants access.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Edge functions use the service role key and are unaffected.
-- =============================================================================

-- The code the caller presented, uppercased. Null if they presented none.
create or replace function public.req_trip() returns text
language sql stable as $$
  select nullif(upper(coalesce(
    current_setting('request.headers', true)::json ->> 'x-trip-code', '')), '')
$$;

-- ---- trips ------------------------------------------------------------------
-- Readable only by code. Anyone may create one. Only the holder may edit it.
alter table public.trips enable row level security;
drop policy if exists "anon trips"     on public.trips;
drop policy if exists "read own trip"  on public.trips;
drop policy if exists "create trips"   on public.trips;
drop policy if exists "update own trip" on public.trips;
drop policy if exists "delete own trip" on public.trips;
create policy "read own trip"   on public.trips for select using (code = public.req_trip());
create policy "create trips"    on public.trips for insert with check (true);
create policy "update own trip" on public.trips for update
  using (code = public.req_trip()) with check (code = public.req_trip());
create policy "delete own trip" on public.trips for delete using (code = public.req_trip());

-- ---- everything belonging to a trip ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'days','votes','expenses','decisions','stay_options','ideas','flights',
    'notes','confirmations','photos','guides','announcements','push_subs'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "anon %s" on public.%I', t, t);
    execute format('drop policy if exists "open %s" on public.%I', t, t);
    execute format('drop policy if exists "trip scoped" on public.%I', t);
    execute format(
      'create policy "trip scoped" on public.%I for all
         using (trip = public.req_trip()) with check (trip = public.req_trip())', t);
  end loop;
end $$;

-- ---- realtime ---------------------------------------------------------------
-- Streaming can't see the header, so it would leak or silently fail. The app
-- refreshes on a timer instead. Remove the tables from the publication.
do $$
declare t text;
begin
  foreach t in array array[
    'trips','days','votes','expenses','decisions','stay_options','ideas',
    'flights','notes','confirmations','photos','guides','announcements'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ---- uploaded files ---------------------------------------------------------
-- Photo and confirmation URLs stay public but unguessable (random path per
-- file). Listing the bucket is not permitted.
drop policy if exists "caravan-files list" on storage.objects;

-- ---- check it worked --------------------------------------------------------
-- Should return 0 rows: without a code header, nothing is visible.
-- select count(*) from trips;
