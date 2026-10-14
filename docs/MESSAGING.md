# Messaging (SMS now, WhatsApp later)

Status: queueing, reminders and the sender are **built and tested locally**
with the `log` provider. **No real SMS has been sent.** Going live needs an SMS
account, a registered sender ID and the user's go-ahead (see "Deploying").

## Flow

1. Something queues a row in `messages` with `status = 'queued'`:
   - the `orders_stage` trigger when an order becomes `ready` (SMS + WhatsApp row;
     WhatsApp is `skipped` unless `organizations.whatsapp_enabled`)
   - `queue_due_reminders()` (pg_cron, every 15 min) for orders `ready` longer than
     `reminder_after`, only between 07:00 and 21:00 in the org's timezone
   - staff pressing "Remind" / sending a manual message (`kind = 'manual'`)
2. pg_cron runs `invoke_sender()` every minute (migration 0005). If anything is
   queued, it POSTs to the Edge Function `send-messages` (URL + secret from Vault).
3. `send-messages` (`supabase/functions/send-messages/index.ts`, core logic in
   `_shared/sender.ts`):
   - `claim_messages('sms', 50)`: recovers rows stuck in `sending` > 10 min, marks
     opted-out customers' rows `skipped`, then claims a batch (`for update skip locked`)
   - sends each via the provider, sender ID = org `sms_sender_id` or `SMS_DEFAULT_SENDER`
   - `finish_message(...)`: `sent` + `provider_id` + `segments`, or back to `queued`
     with `error` (up to 3 attempts), then `failed`
4. **To build:** a provider delivery-report webhook to set `delivered` / `failed`.

Usage per org and month: view `sms_usage` (messages, segments), RLS-scoped.

Local testing: `SUPABASE_SERVICE_ROLE_KEY=… npm run send:local` runs the same
sender against the local stack with the `log` provider (prints, never sends).
Messages sent by the `log` provider have `provider_id` `log:…` and show as
"Test send" in the app.

## Rules

- Skip customers with `sms_opt_out = true` (the trigger already does this for stage
  messages; the reminder job and manual sends must too).
- Sender ID per org: `organizations.sms_sender_id`, falling back to the platform
  default (e.g. `VELOXA`). Sender IDs must be registered with the provider.
- Keep SMS ≤ 160 GSM-7 characters; emoji force UCS-2 (70 chars per segment), so
  use **no emoji in SMS**. WhatsApp may use emoji.
- Never send between 21:00 and 07:00 Africa/Accra for reminders; hold until morning
  (enforced in `queue_due_reminders`).
- Reminders: at most `reminder_max` per order, spaced by `reminder_after`; update
  `orders.reminders_sent` and `last_reminder_at`.
- Meter usage per org for billing (count of `sent` SMS segments per month).

## Providers (not chosen yet)

| Provider | Notes |
|----------|-------|
| Arkesel | Popular with Ghana devs, simple REST API, sender-ID registration |
| Hubtel | Large Ghana company; also does payments |
| mNotify | Simple REST, bulk SMS |

Providers live in `supabase/functions/_shared/providers.ts` behind one interface;
`SMS_PROVIDER` picks one. Implemented: `arkesel` (from the public API docs,
**not yet verified against a real account**) and `log`. Adding Hubtel or mNotify
is one object in that file plus a test. API keys go in Edge Function secrets only.

## Deploying (hosted project; ask the user before any real send)

```bash
npx supabase functions deploy send-messages --no-verify-jwt
npx supabase secrets set SMS_PROVIDER=arkesel SMS_API_KEY=... SMS_DEFAULT_SENDER=VELOXA CRON_SECRET=<long random>
```
Then, once, in the SQL editor (turns on the every-minute call):
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-messages', 'send_messages_url');
select vault.create_secret('<same CRON_SECRET>', 'send_messages_secret');
```
First live test: set the org's phone to a staff member's number, mark a test
order ready, and confirm the SMS arrives and the Messages tab shows "Sent".
To stop all sending immediately: `npx supabase secrets unset SMS_PROVIDER`.

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
