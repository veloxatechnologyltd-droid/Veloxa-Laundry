# Messaging (SMS now, WhatsApp later)

Status: **queueing is built** (DB trigger); **sending is not** (Phase 3).

## Flow

1. Something queues a row in `messages` with `status = 'queued'`:
   - the `orders_stage` trigger when an order becomes `ready` (SMS + WhatsApp row;
     WhatsApp is `skipped` unless `organizations.whatsapp_enabled`)
   - the reminder job (to build) for orders that have been `ready` longer than `reminder_after`
   - staff pressing "Remind" / sending a manual message (`kind = 'manual'`)
2. Edge Function `send-messages` (to build) runs every minute (pg_cron + `pg_net`,
   or a Supabase scheduled function):
   - claims a batch: `update messages set status='sending', attempts=attempts+1
     where id in (select id from messages where status='queued' order by created_at
     limit 50 for update skip locked) returning *`
   - sends each via the provider for its channel
   - sets `sent` + `provider_id`, or `failed` + `error` (requeue if `attempts < 3`)
3. A provider delivery webhook (Edge Function) sets `delivered` / `failed`.

## Rules

- Skip customers with `sms_opt_out = true` (the trigger already does this for stage
  messages; the reminder job and manual sends must too).
- Sender ID per org: `organizations.sms_sender_id`, falling back to the platform
  default (e.g. `VELOXA`). Sender IDs must be registered with the provider.
- Keep SMS ≤ 160 GSM-7 characters; emoji force UCS-2 (70 chars per segment), so
  use **no emoji in SMS**. WhatsApp may use emoji.
- Never send between 21:00 and 07:00 Africa/Accra for reminders; hold until morning.
- Reminders: at most `reminder_max` per order, spaced by `reminder_after`; update
  `orders.reminders_sent` and `last_reminder_at`.
- Meter usage per org for billing (count of `sent` SMS segments per month).

## Providers (not chosen yet)

| Provider | Notes |
|----------|-------|
| Arkesel | Popular with Ghana devs, simple REST API, sender-ID registration |
| Hubtel | Large Ghana company; also does payments |
| mNotify | Simple REST, bulk SMS |

Wrap the provider behind one interface (`send(to, body, senderId) → {id} | error`)
so it can be swapped. API keys go in Edge Function secrets only.

## WhatsApp (later)

- Meta WhatsApp Business Cloud API. Requires Meta Business verification, a phone
  number, and **pre-approved templates** for business-initiated messages (e.g.
  `order_ready`, `pickup_reminder` with variables name/code/balance).
- Free-form text is only allowed within 24h of the customer messaging us.
- Turn on per org with `organizations.whatsapp_enabled`.

## Message templates (current wording in the trigger)

- SMS ready: `{Shop}: {CODE} is ready for pickup. Fully paid.` / `Balance: GHS 26.00.`
- WhatsApp ready: `Hi {FirstName}, your order {CODE} is ready for pickup. {balance}`

Demo wording (with emoji, for WhatsApp) is in the demo's `store.tsx`
(`autoMessages`, `reminderMessages`).
