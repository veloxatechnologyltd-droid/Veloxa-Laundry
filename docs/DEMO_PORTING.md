# Porting the sales demo UI

The demo at `~/Projects/Laundry-Demo` (≈3,100 lines, React 18 + TS + Vite +
Tailwind v4) already has a polished UI. Production reuses its screens but
replaces the fake in-memory store with Supabase. **Copy files into this repo; never
edit the demo.**

## Demo file map

| Demo file | Lines | Production plan |
|-----------|-------|-----------------|
| `src/ui.tsx` | 191 | Copy as-is: `QRTag`, `Avatar`, `StageBadge`, `FlagPill`, `StageTrack`, `Swatch`, `StatCard` |
| `src/index.css` | | Copy (Tailwind v4 theme, `glass`, `ring-soft`, animations) |
| `src/photo.ts` | 30 | Copy. `fileToDataURL` downscales to 720px JPEG; production should upload a Blob to Storage instead of keeping a data-URL |
| `src/data.ts` | 355 | Keep the **types and `STAGES` metadata** (labels, emoji, colours). Drop seed data, `customerById`, fixed demo date. `SERVICES` becomes the `services` table |
| `src/store.tsx` | 408 | **Rewrite.** Demo = React state + `localStorage` (`veloxa_state_v1`) + client-side message generation + a 45-second auto-reminder for live pitches. Production = Supabase queries + offline outbox; messages come from DB triggers, reminders from a scheduled job |
| `src/App.tsx` | 176 | Keep the layout, nav and toasts. Add auth gate, org switcher, settings. Hash routing (`#board`) is OK at first; switch to a router when the tracking page needs `/t/<token>` |
| `screens/Intake.tsx` | 464 | Port. Codes come from the reserved block; prices from `services`; photos upload to Storage |
| `screens/Board.tsx` | 184 | Port. Stage change = `update orders set stage`. "🔔 Remind" inserts a `manual` message |
| `screens/Clients.tsx` | 410 | Port. Demo's `seedHistory()` fake past orders → real query |
| `screens/Dashboard.tsx` | 245 | Port with real aggregates (today's intake, ready, unpaid balances) |
| `screens/Tracking.tsx` | 263 | Becomes the **public** page `/t/<token>` using the `get_tracking` RPC |
| `screens/Messages.tsx` | 125 | Port as a message log with delivery status |
| `screens/Compare.tsx` | 142 | **Don't port.** Sales-only "old way vs Veloxa" screen |
| `components/AddClientModal.tsx` | 97 | Port. Normalise phone to E.164 |

## Model differences

| Demo | Production |
|------|-----------|
| `Order.code` `WP-4821` | `VX-1042` from `organizations.code_prefix` + reserved number |
| `Item.photo` data-URL | `order_items.photo_path` in Storage; signed URL to display |
| `Item.service` string key | `service_id` uuid + `unit_price` snapshot |
| `Order.total` cedis number | pesewas integer |
| `Order.paid: boolean` | `amount_paid` vs `total` (partial payments allowed) |
| `Item.emoji`, `Item.color` swatch | `type`, `color_name`, `color_hex`; emoji can be derived from type in the UI |
| `Customer.initials`, `tint`, `orders` count | Computed in the UI / by query, not stored |
| `Message.outbound/auto` | `messages.kind` + `status` |

## Demo-only behaviour to leave out

- Fixed "now" (`2026-07-07T09:12`) and seeded customers (Evans Okyere, WP-4821).
- 45-second auto-reminder (production uses `organizations.reminder_after`).
- "Reset demo" button.
- Standalone single-file build (`vite-plugin-singlefile`); production is a PWA.
