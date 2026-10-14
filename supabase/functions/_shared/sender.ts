// Core of the send-messages function, free of Deno/Supabase imports so it can
// be unit-tested. The DB does the bookkeeping (claim_messages / finish_message
// in migration 0004); this loop only moves messages between it and the provider.

import type { Provider } from "./providers.ts";
import { smsSegments } from "./sms.ts";

export interface ClaimedMessage {
  id: string;
  org_id: string;
  to_phone: string;
  body: string;
  attempts: number;
  sender_id: string | null;
}

export interface SenderDb {
  claim(batch: number): Promise<ClaimedMessage[]>;
  finish(id: string, ok: boolean, providerId: string | null, error: string | null, segments: number | null): Promise<void>;
}

export interface SenderResult {
  sent: number;
  failed: number;
}

const SENDER_ID = /^[A-Za-z0-9 ]{1,11}$/;

export async function runSender(
  db: SenderDb,
  provider: Provider,
  opts: { defaultSender: string; batch?: number; maxBatches?: number; concurrency?: number }
): Promise<SenderResult> {
  const batch = opts.batch ?? 50;
  const concurrency = opts.concurrency ?? 5;
  const result: SenderResult = { sent: 0, failed: 0 };

  const sendOne = async (m: ClaimedMessage) => {
    const sender = m.sender_id && SENDER_ID.test(m.sender_id) ? m.sender_id : opts.defaultSender;
    const segments = smsSegments(m.body);
    let ok = false;
    let id: string | null = null;
    let error: string | null = null;
    try {
      const r = await provider.send({ to: m.to_phone, body: m.body, sender });
      if (r.ok) {
        ok = true;
        id = r.id ?? null;
      } else error = r.error;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await db.finish(m.id, ok, id, error, ok ? segments : null);
    if (ok) result.sent++;
    else result.failed++;
  };

  for (let b = 0; b < (opts.maxBatches ?? 5); b++) {
    const msgs = await db.claim(batch);
    if (msgs.length === 0) break;
    for (let i = 0; i < msgs.length; i += concurrency) {
      await Promise.all(msgs.slice(i, i + concurrency).map(sendOne));
    }
    if (msgs.length < batch) break;
  }
  return result;
}
