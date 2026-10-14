# Offline PWA design

Status: **designed, not built** (Phase 4). The schema already supports it.

## Goal

Front-desk staff can take in orders, tag items, move stages and record cash
payments with no internet. Changes sync when the connection returns. Customer
messages go out after sync, which is acceptable.

## Pieces

1. **Service worker** (e.g. `vite-plugin-pwa`) caches the app shell; installable.
2. **Local cache** (IndexedDB, e.g. Dexie): customers, open orders, items,
   services for the active org. Refreshed when online (pull everything changed since
   `updated_at` / `created_at` > last sync).
3. **Outbox** (IndexedDB): an ordered list of mutations
   `{id, table, op: insert|update, row, created_at}`. The UI applies them to the
   local cache immediately (optimistic), then the sync worker replays them in order.
4. **Order codes:** while online, keep ≥ 20 unused codes per device from
   `reserve_order_codes(org, n)`. Intake takes the next one. Gaps in numbering are fine.

## Why it is safe to replay

- All ids are client-generated UUIDs, so replaying an insert uses
  `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`.
- Codes/tags come from reserved blocks, so two devices never produce the same code.
- Stage changes are plain `update orders set stage = X`; the trigger ignores
  no-op updates, so a replay doesn't double-log or double-message.
- Payments are inserts with a client id, so they are never counted twice.

## Conflicts

Last write wins per column, which is acceptable for this domain. Exception: stage
should never move backwards because of a stale replay. Before replaying a stage update,
compare with the server's current stage and skip it if the server is already further
along (or enforce this in the DB later).

## UI

- Show an online/offline pill and the number of pending changes.
- If a sync fails (e.g. an RLS error), keep the item and show it to the user.
  Never drop it silently.
- Photos taken offline are stored as Blobs in IndexedDB and uploaded on sync before
  the `order_items` row that references them.
