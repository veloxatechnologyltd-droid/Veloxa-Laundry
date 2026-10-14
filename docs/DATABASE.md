# Database

Postgres on Supabase. The schema lives in `supabase/migrations/` (applied in
filename order). `0001_init.sql` is the schema; `0002_realtime.sql` adds
`orders` and `messages` to the `supabase_realtime` publication (guarded so the
plain-Postgres test harness still migrates). `0003_orders_invites_reminders.sql`
adds `create_order`, invites, `queue_due_reminders` (+ pg_cron schedule) and makes
the "ready" messages fire once per order.

## Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organizations` | One laundry business (tenant) | `slug`, `code_prefix` (e.g. `VX`), `plan`, `paid_until`, `sms_sender_id`, `whatsapp_enabled`, `reminder_after`, `reminder_max`, `next_order_number` |
| `memberships` | User ↔ org with role | PK `(org_id, user_id)`, `role`, `display_name` |
| `branches` | Shop locations | `name`, `address`. A "Main" branch is created at signup |
| `services` | Price list per org | `label`, `unit`, `price` (pesewas), `active`, `sort` |
| `customers` | Laundry's clients | `phone` E.164, unique per org; `vip`, `sms_opt_out` |
| `orders` | One drop-off | `code` unique per org, `stage`, `total`, `amount_paid`, `ready_by`, `ready_at`, `collected_at`, `reminders_sent`, `tracking_token` |
| `order_items` | Each garment/lot | `tag` unique per org, `type`, `color_name`, `service_id`, `qty`, `unit_price` (snapshot), `flag`, `photo_path` |
| `order_events` | Stage timeline | Written **only** by trigger |
| `payments` | Money received | `amount`, `method` (cash/momo/card/bank); syncs `orders.amount_paid` |
| `messages` | Outbound SMS/WhatsApp queue and log | `channel`, `kind` (stage/reminder/manual), `status`, `attempts`, `provider_id`, `error` |
| `invites` | Pending staff invites | `email` (lowercase), `role`, `display_name`, `accepted_at`; one pending invite per (org, email) |

Enums: `member_role`, `order_stage`, `item_flag`, `msg_channel`, `msg_status`,
`msg_kind`, `pay_method`, `plan_tier`.

## Functions

| Function | Who calls it | What it does |
|----------|--------------|--------------|
| `is_member(org)`, `has_role(org, roles[])` | RLS policies | Membership checks (security definer) |
| `create_organization(name, slug, owner_name)` | App, after signup | Creates org, makes caller owner, adds Main branch and default services |
| `reserve_order_codes(org, n)` | App, while online | Reserves `n` order numbers for offline use; returns `prefix, first_number, last_number` |
| `get_tracking(token)` | Public tracking page (anon) | Returns order summary JSON for one order; no other data is exposed |
| `create_order(p_order, p_items)` | Intake | Inserts order + items in one transaction as the caller (RLS applies). Unit prices come from `services`; express ×1.5. No-op if the order id exists |
| `my_invites()` | Onboarding | Pending invites matching the caller's JWT email |
| `accept_invite(invite)` | Onboarding | Email must match; creates the membership |
| `queue_due_reminders()` | pg_cron (every 15 min) only | Queues reminder SMS for orders ready longer than `reminder_after`, up to `reminder_max` (manual reminders count). Not executable by app users |
| `balance_text(total, paid)` | Triggers / reminders | "Fully paid." or "Balance: GHS 12.50." |

## Triggers

| Trigger | Effect |
|---------|--------|
| `orders_touch` | Sets `updated_at` |
| `payments_sync` | Recomputes `orders.amount_paid` from `payments` |
| `orders_stage` | On insert/stage change: inserts `order_events`. On the **first** `ready` (ready_at null): sets `ready_at`, queues SMS (+ WhatsApp, or `skipped` if disabled) unless the customer opted out. On `delivered`: sets `collected_at` |

## Access rules (RLS)

| Table | Read | Insert/Update | Delete |
|-------|------|---------------|--------|
| organizations | members | owners; only the columns in the `grant update (...)` list | none |
| memberships | members | owners | owners |
| branches, services | members | owners, managers | owners, managers |
| customers, orders, order_items, payments | members | members | owners, managers |
| order_events | members | trigger only | none |
| messages | members | members may insert `kind=manual, status=queued` only; status updates via service role | none |
| invites | owners | owners | owners |
| storage `item-photos` | members of org in first path segment | same | none yet |

## Conventions

- Money: integer pesewas. `3600` = GHS 36.00.
- Timestamps: `timestamptz`; display in the org's `timezone` (Africa/Accra).
- New tables: `id uuid default gen_random_uuid()`, `org_id` FK with `on delete
  cascade`, an index starting with `org_id`, RLS enabled, policies, and a test.
- Never edit an applied migration; add `NNNN_short_name.sql`.

## Testing

```bash
supabase/tests/run.sh
```
This starts a throwaway `postgres:16` container, loads
`tests/00_supabase_stub.sql` (stand-ins for Supabase's `auth.uid()`, `auth.users`,
`storage.*`, and the `anon`/`authenticated` roles), applies every migration, then runs
`tests/[1-9]*.sql`. Tests use `pg_temp.expect(condition, label)` and stop at the first
failure. It also simulates users by `set request.jwt.claim.sub = '<uuid>'`.

Docker on the dev machine can be slow to start containers (minutes). If needed,
run it in the background.

Once a real Supabase project exists, also run migrations with the Supabase CLI
(`supabase db push`) against staging before production.

## Known gaps / TODO

- No audit log yet (Phase 6).
- Storage delete/update policies not defined.
- Invites are by email only; no invite email is sent, and a user who already
  belongs to one laundry only sees invites on the onboarding screen (not yet in the app).
