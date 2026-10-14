# Decision log

Newest at the bottom. Add an entry for any decision a future agent might
otherwise second-guess. Format: date, decision, why, alternatives.

---

### 2026-10-14: Separate repo from the sales demo
**Decision:** Production lives in `~/Projects/veloxa-app`; the demo at
`~/Projects/Laundry-Demo` stays untouched.
**Why:** The demo is an active sales tool (offline single-file build, seeded fake
data, timed auto-reminders for live pitches). Production needs different
behaviour and must not break the pitch.
**Alternatives:** Evolve the demo in place (rejected: risks the sales tool).

### 2026-10-14: Full SaaS from the start
**Decision:** Multi-tenant with self-signup and billing, not a Kappa 7-only build.
**Why:** User's choice. Avoids a rewrite when shop #2 signs.
**Note:** Kappa 7's pilot can go live after Phases 1–3; self-signup and billing
(Phase 5) don't block it.

### 2026-10-14: Supabase as backend
**Decision:** Supabase (Postgres + Auth + Storage + Edge Functions).
**Why:** Fastest path for a solo founder; RLS gives tenant isolation in the
database; cheap at this scale; keeps the existing React/Vite frontend.
**Alternatives:** Custom Node API + Postgres (more ops); Firebase (NoSQL is
worse for orders and reports).

### 2026-10-14: SMS first, WhatsApp later
**Decision:** Ghana SMS gateway now (Arkesel / Hubtel / mNotify, not yet chosen);
WhatsApp Business Cloud API after Meta business verification and template approval.
**Why:** SMS works immediately; Meta verification takes days to weeks.
The schema already queues WhatsApp rows (as `skipped` until
`organizations.whatsapp_enabled`).

### 2026-10-14: Offline-tolerant PWA
**Decision:** Staff app must keep working when the internet drops.
**Why:** Ghana connectivity is unreliable; intake can't stop.
**Consequences:** Client-generated UUIDs, an IndexedDB outbox, and per-device
reserved order-code blocks (`reserve_order_codes`). See OFFLINE.md.

### 2026-10-14: Money as integer pesewas
**Why:** Avoids float rounding. `3600` = GHS 36.00.

### 2026-10-14: Order code prefix `VX` (configurable per org)
**Why:** The demo used `WP-` (from the old "WashPoint" name). Production uses
`organizations.code_prefix`, default `VX`; each laundry can set its own (1–4
capital letters).

### 2026-10-14: Business rules in Postgres triggers
**Decision:** Stage timeline, amount-paid sync, and "ready" message queueing are
DB triggers, not frontend code.
**Why:** Offline replays and multiple devices all go through one place, and
messages are queued exactly once per stage change.

### 2026-10-14: Frontend data layer is a thin Supabase store, not a cache library
**Decision:** `src/store.tsx` loads services, customers, open orders (+ delivered
in the last 3 days), recent messages and today's payments for the active org,
and refreshes on window focus, every 30s, and on realtime changes to
`orders`/`messages`. Mutations write directly, then refresh.
**Why:** Shops are small (hundreds of open orders at most); simple to replace
with the Phase 4 IndexedDB outbox, which will sit in front of the same functions.
**Alternatives:** TanStack Query (more machinery than needed now).

### 2026-10-14: Order creation = photos → order → items, from the client
**Decision:** Photos upload first (so an item never points at a missing file),
then the `orders` insert, then `order_items`. Codes come from a per-device block
in localStorage (`src/lib/codes.ts`); on a code clash (two tabs sharing a
block) the insert retries with the next code.
**Why:** Row-by-row client-id inserts are what the offline outbox will replay.
**Known gap:** if the items insert fails, an order with no items remains.
Acceptable for now; revisit with the outbox (or a `create_order` RPC).

### 2026-10-14: Customer phone is required
**Decision:** The add-client form requires a valid phone (normalised to E.164
by `toE164`); the demo allowed it to be blank.
**Why:** `customers.phone` is `not null` and unique per org, and the product's
value is the pickup SMS.

### 2026-10-14: "Move back" a stage is owners/managers only, in the UI
**Why:** Fixes mis-taps. Note moving back to an earlier stage and forward to
`ready` again queues another "ready" SMS (the trigger fires on each change).
Not enforced in the DB yet.

### 2026-10-14: Local Supabase ports 553xx
**Why:** Another project on the dev machine runs local Supabase on the default
543xx ports. Changed in `supabase/config.toml` only; hosted projects are unaffected.
