# Architecture

## Overview

```
 Staff PWA (React, installable)
   │  reads: Supabase JS client (RLS-scoped to the user's org)
   │  writes: IndexedDB outbox ──sync when online──► Postgres
   │
   ├─► Supabase Auth          (email/password now; phone OTP later)
   ├─► Supabase Storage       item-photos/<org_id>/<order_id>/<item_id>.jpg
   └─► Postgres (RLS)
          │ trigger on orders.stage → order_events row + queued messages
          ▼
       messages (status = queued)
          │ pg_cron every minute / database webhook
          ▼
       Edge Function send-messages ──► Ghana SMS gateway
                                   └─► WhatsApp Cloud API (later)
          ▲
          └── delivery-status webhooks update messages.status

 Customer tracking page  /t/<tracking_token>  (no login; calls get_tracking RPC as anon)

 Billing: Paystack subscription ─webhook─► Edge Function ─service role─► organizations.plan / paid_until
```

## Components

| Component | Tech | Notes |
|-----------|------|-------|
| Staff app | React 18 + TS + Vite + Tailwind v4 | Ported from the demo; see DEMO_PORTING.md |
| Auth | Supabase Auth | A user can belong to several orgs (`memberships`); app keeps an "active org" |
| Database | Supabase Postgres | All tenancy enforced by RLS; see DATABASE.md |
| Files | Supabase Storage, private bucket `item-photos` | First path segment must be `org_id` (RLS checks it). Photos are downscaled client-side before upload (reuse demo `photo.ts`). |
| Server logic | Postgres triggers/functions first; Edge Functions (Deno) only for things needing secrets or external calls | Keeps business rules in one place and offline-safe |
| Messaging | Edge Function + SMS gateway | See MESSAGING.md |
| Offline | Service worker + IndexedDB outbox | See OFFLINE.md |
| Billing | Paystack (MoMo + card) | Phase 5 |
| Hosting | Static frontend on Vercel/Netlify/Cloudflare Pages | Not decided yet |

## Multi-tenancy

- A laundry business = one row in `organizations` (the "org").
- People join orgs through `memberships` with role `owner | manager | staff`.
- Every business row has `org_id`. RLS uses `is_member(org_id)` and
  `has_role(org_id, roles)`, both `security definer` to avoid recursive RLS.
- Signup flow: user signs up → calls `create_organization(name, slug, owner_name)`
  → becomes owner, gets a "Main" branch and default services/prices.

## Order lifecycle

1. **Intake:** staff picks or creates the customer, adds items (type, colour,
   service, qty, flags, photo). Code `VX-1042` comes from the device's reserved
   block; item tags are `VX-1042-01`, `-02`… Tags are printed.
2. **Stages:** `received → washing → drying → ironing → ready → delivered`. Each
   change inserts an `order_events` row (trigger).
3. **Ready:** the trigger sets `ready_at` and queues SMS (and WhatsApp if enabled).
4. **Reminders:** a scheduled job queues reminders for orders that have been
   `ready` longer than `organizations.reminder_after`, up to `reminder_max`.
5. **Payment:** any number of `payments` rows; `orders.amount_paid` is kept in
   sync by trigger. Balance = `total - amount_paid`.
6. **Pickup:** scan or check tags against the manifest, then mark `delivered`
   (sets `collected_at`).

## Environments

| Env | Purpose |
|-----|---------|
| local | `supabase/tests/run.sh` for SQL; Vite dev server against a dev Supabase project |
| staging | Separate Supabase project; test SMS sender |
| production | Real tenants. Deploys need user approval. |
