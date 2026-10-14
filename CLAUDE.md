# CLAUDE.md: start here

Guide for any AI agent (or new developer) working in this repo. Read this first,
then the doc for the area you are touching.

## What this is

**Veloxa Laundry Management** is a SaaS app that helps laundries and dry cleaners
in Ghana stop losing and mixing up clothes. It handles intake with per-item tags and
photos, a stage board (received → washing → drying → ironing → ready → delivered),
customer records, payments, and automatic SMS/WhatsApp messages to customers.

- Product of **Veloxa Technology Ltd** ("Veloxa Laundry Management, a subsidiary of
  Veloxa Technology Ltd"). Never call it "WashPoint" (old working name).
- Market: Ghana. Currency GHS (₵), phones +233, customers live on WhatsApp/SMS.
- First customer: **Kappa 7 Laundry & Dry Cleaning** (2-month free pilot). See
  [docs/BUSINESS.md](docs/BUSINESS.md).

## Where things are

| Path | What |
|------|------|
| [PLAN.md](PLAN.md) | Phased roadmap with checkboxes. **The source of truth for status.** Update it when you finish something. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, tech stack |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, RLS model, functions, migrations, how to test |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log: why things are the way they are. Append, don't rewrite. |
| [docs/MESSAGING.md](docs/MESSAGING.md) | SMS / WhatsApp design (Phase 3) |
| [docs/OFFLINE.md](docs/OFFLINE.md) | Offline PWA + sync design (Phase 4) |
| [docs/DEMO_PORTING.md](docs/DEMO_PORTING.md) | How to reuse the sales demo's UI |
| [docs/BUSINESS.md](docs/BUSINESS.md) | Brand, customers, pricing, deal terms |
| [docs/SETUP.md](docs/SETUP.md) | Local setup, env vars, deploy |
| `supabase/migrations/` | SQL migrations, applied in filename order |
| `supabase/tests/` | SQL tests; run with `supabase/tests/run.sh` |
| `~/Projects/Laundry-Demo` | The **sales demo**, a separate project. Do not modify it as part of production work. |

## Current status (update this line when it changes)

Phases 1–2 built and verified against a **local** Supabase stack: auth +
onboarding, intake (photos), board, order detail + payments, clients, messages
log, settings (prices, staff invites), public tracking page; pickup reminders
queued by pg_cron; SMS sender Edge Function (tested with the `log` provider,
nothing really sent). Hosted Supabase project not created yet
(needs the user). Next: Phase 3 messaging. See PLAN.md.

## Rules

1. **Tenant isolation is the #1 invariant.** Every business table has `org_id`
   and RLS. A new table without RLS policies is a bug. Add a test to
   `supabase/tests/` proving another org can't read or write it.
2. **Money is integer pesewas** (GHS × 100). Never floats. Format only at display.
3. **Ids are UUIDs generated on the client** (`crypto.randomUUID()`) so offline
   writes can be replayed safely. Don't rely on server-generated ids for inserts.
4. **Never edit an applied migration.** Add a new `NNNN_description.sql`.
5. **Billing columns** (`organizations.plan`, `paid_until`) are changed only by
   the service role (payment webhook), never by the app.
6. Phones are stored in **E.164** (`+233241184477`). Normalise on input.
7. Customer-facing text is short, friendly, Ghana-appropriate; SMS ≤ 160 chars
   where possible (cost is per segment).
8. Secrets (service role key, SMS/Paystack keys) live only in Supabase Edge
   Function secrets / hosting env vars, never in the frontend or git.
9. Keep `PLAN.md`, the status line above, and `docs/DECISIONS.md` current. The
   next agent has no other memory of your work.
10. Ask the user before: spending money, creating accounts, deploying to
    production, sending real SMS/WhatsApp, or changing pricing/deal terms.

## Commands

```bash
npx supabase@2.120.0 start -x studio,edge-runtime,logflare,vector,supavisor,imgproxy,postgres-meta
                           # local Supabase on ports 553xx (API http://127.0.0.1:55321)
npm run dev                # app on http://localhost:5173 (needs .env.local, see docs/SETUP.md)
npm test                   # unit tests (vitest)
npm run build              # typecheck + production build
npm run send:local         # send queued SMS on the local stack via the log provider (needs SUPABASE_SERVICE_ROLE_KEY)
supabase/tests/run.sh      # apply migrations to throwaway Postgres + run SQL tests (needs docker, psql)
```

## Frontend layout

`src/lib/` pure helpers (types, money/phone formatting, order codes, photos) ·
`src/auth.tsx` session + active org · `src/store.tsx` all Supabase reads/writes
for the active org · `src/screens/` one file per tab · `src/components/` modals.

## Stack

React 18 + TypeScript + Vite + Tailwind v4 (same as the demo) · Supabase
(Postgres, Auth, Storage, Edge Functions) · Ghana SMS gateway · PWA (offline) ·
Paystack (billing, later).
