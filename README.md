# SquadTrip 📍

**Plan group trips together.** Shared itinerary, group votes, stay proposals,
budget splitting with settle-up, flight boards, a confirmations vault, photos,
notes, packing, and a translator — synced live across everyone's phones.
**One link, no accounts**: create a trip, get a code, text it to your crew.

Built as a static PWA (installable, offline-capable, auto-updating) on
GitHub Pages + Supabase. No build step — plain HTML/CSS/JS.

## How it works
- **Create a trip** → a short join code (e.g. `X7KQ2P`) identifies it
- Share `https://<your-pages-url>/?t=X7KQ2P` — friends open it, pick their
  name, and everything they do syncs live for the group
- The code is the secret: anyone who has it can read/write that trip

## Wedding mode 💍

Creating a trip offers two types: **Group trip** and **Destination wedding**.
Wedding mode flips the model from all-peers to hosts-and-guests: the couple
(+ planners) edit the schedule, links, and settings; guests add themselves
from the invite code, RSVP with a party size, see dress codes, the room
block, and the registry, and drop flight info for shuttle planning.

Projects created before wedding mode need one migration (SQL Editor):

```sql
alter table public.trips add column if not exists mode  text  not null default 'trip';
alter table public.trips add column if not exists hosts jsonb not null default '[]';
alter table public.trips add column if not exists links jsonb not null default '{}';
```

## One-time setup (own your own SquadTrip)
1. **Fork/clone this repo** and enable GitHub Pages (Settings → Pages →
   Deploy from a branch → `main` / root).
2. **Create a free [Supabase](https://supabase.com) project.**
3. In Supabase → **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
4. In Supabase → **Project Settings → API Keys**, copy the Project URL and
   the publishable/anon key into [`js/config.js`](js/config.js).
5. Open your Pages URL → **Create a trip**. Done.

## ✨ AI trip setup (optional, recommended)
One tap drafts the whole trip: a day-by-day itinerary, a destination guide,
neighborhood breakdowns per stop, and starter votes + ideas — all editable.

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Supabase → **Edge Functions → Deploy new function** → name it
   `generate-plan`, paste `supabase/functions/generate-plan/index.ts`,
   and **turn OFF "Verify JWT"**.
3. Edge Functions → **Secrets** → add `ANTHROPIC_API_KEY`.
4. In any trip with an empty plan, tap **✨ Set up my trip**.

Costs a few cents per generation (Claude API usage); each trip is capped at
6 generations.

## Stack
- Plain HTML/CSS/JS, [Leaflet-free], no framework, no bundler
- [Supabase](https://supabase.com) — Postgres + Realtime + Storage (free tier)
- Live FX via open.er-api.com, translation via MyMemory (both keyless)
- PWA: add-to-home-screen, offline shell, self-updating service worker

## Notes
- Votes, RSVPs, expenses, photos, etc. are shared per-trip; packing and
  "who am I" are per-device.
- This is a friends-and-family tool: there's no auth, so treat trip codes
  like you'd treat a private group-chat invite.
