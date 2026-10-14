# Veloxa Laundry Management — Production Plan

The sales demo (`~/Projects/Laundry-Demo`) stays untouched as the pitch tool.
This repo is the real, multi-tenant SaaS.

## Decisions

| Area      | Choice                                                                 |
|-----------|------------------------------------------------------------------------|
| Scope     | Full SaaS: self-signup, many laundries, billing                        |
| Backend   | Supabase (Postgres, Auth, Storage, Edge Functions, RLS per laundry)    |
| Frontend  | React + TS + Vite + Tailwind v4 (reuse demo screens)                    |
| Messaging | Ghana SMS gateway now (Arkesel / Hubtel / mNotify); WhatsApp Cloud API later |
| Offline   | Installable PWA; writes queue locally and sync when back online        |
| Money     | GHS, stored as integer pesewas                                         |

## Architecture

```
 Staff PWA (React)  ──► Supabase Auth (phone OTP / email)
   │  IndexedDB outbox ──sync──► Postgres (RLS: org_id = my org)
   │                               │ trigger: stage → ready
   ▼                               ▼
 Customer tracking page        messages (status = queued)
 (public token, no login)          │ cron / webhook
                                   ▼
                            Edge Function: send-messages ──► SMS gateway
                                                         └─► WhatsApp API (later)
 Billing: Paystack (MoMo + card) ─webhook─► organizations.plan / paid_until
```

Offline order codes: each device reserves a block of codes while online
(`reserve_order_codes`), so tags can be printed at intake with no internet.
All rows use client-generated UUIDs, so replaying the outbox is idempotent.

## Phases

### Phase 1: Foundation
- [x] Schema + RLS migration (`supabase/migrations/0001_init.sql`)
- [x] SQL test suite (`supabase/tests/run.sh`), passing
- [x] Agent/dev docs (`CLAUDE.md`, `docs/`)
- [x] Local Supabase stack (`npx supabase start`, ports 553xx); migrations apply cleanly
- [ ] Create hosted Supabase project, `supabase db push` (blocked on user)
- [x] Scaffold app, port demo UI, auth (email signup → create laundry → owner)
- [x] Invite staff by email + role (`invites`, `my_invites`, `accept_invite`; no invite email sent yet, owner tells them)
- [x] Replace `store.tsx` localStorage with Supabase data layer (+ realtime refresh, `0002_realtime.sql`)

### Phase 2: Core operations
- [x] Intake → orders/items, item photos to Storage (per-org folder)
- [x] Board stage changes, timeline, payments (cash / MoMo, partial); order detail sheet
- [x] Clients directory + history; services/prices editable per laundry (Settings)
- [x] Customer tracking page via secret link (`/t/<token>`; host must rewrite all paths to index.html)
- [ ] Add the tracking link to the "ready" SMS body (needs a public app URL; keep ≤160 chars)
- [x] Order + items created atomically via `create_order` RPC (DB prices items, idempotent)
- [x] "Ready" SMS queued only the first time an order becomes ready
- [ ] Stop stale stage replays moving an order backwards (see OFFLINE.md "Conflicts")

### Phase 3: Messaging
- [x] `send-messages` Edge Function + retries (3 attempts) + stuck-message recovery; every-minute pg_cron call (`0005`)
- [x] Provider interface: `arkesel` (unverified) + `log` test provider; `npm run send:local`
- [ ] Go live: SMS account + sender ID, deploy function, set secrets + Vault (docs/MESSAGING.md "Deploying"); needs user
- [ ] Delivery-report webhook (`delivered` status)
- [x] Auto "ready" SMS queued by trigger
- [x] Scheduled pickup reminders: `queue_due_reminders()` via pg_cron every 15 min (org `reminder_after` / `reminder_max`)
- [x] Per-org SMS sender ID + usage metering (`messages.segments`, `sms_usage` view, shown on Messages tab)
- [ ] WhatsApp Cloud API once Meta business verification + templates approved

### Phase 4: Offline + devices
- [ ] PWA (service worker, install prompt), IndexedDB cache + outbox sync
- [ ] Tag/receipt printing (thermal printer, 58/80mm), QR scan at pickup

### Phase 5: SaaS
- [ ] Self-signup + onboarding wizard (shop name, services, prices, staff)
- [ ] Plans + Paystack subscriptions; trial; suspend on non-payment
- [ ] Super-admin console (tenants, usage, support)
- [ ] Reports (daily takings, turnaround, outstanding balances), CSV export

### Phase 6: Hardening
- [ ] Error monitoring (Sentry), backups (Supabase PITR), audit log
- [ ] Privacy policy + terms (Ghana Data Protection Act, 2012 / Act 843)
- [ ] Load test, RLS tests, staging environment, CI deploys

## Needed from you
1. Supabase account + project (region: closest to Ghana is `eu-west`/`eu-central`)
2. SMS provider account + API key, and a registered sender ID (e.g. `VELOXA`)
3. Paystack account (business verification) for subscriptions
4. Domain (e.g. app.veloxa…) and hosting (Vercel / Netlify / Cloudflare Pages)
5. Meta Business verification started now, since it is slow (for WhatsApp later)
