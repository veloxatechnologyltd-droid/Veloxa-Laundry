// Flush queued SMS on the LOCAL stack with the log provider (prints instead of
// sending). Same code path as the send-messages Edge Function.
// Usage: npm run send:local
import { createClient } from "@supabase/supabase-js";
import { logProvider } from "../supabase/functions/_shared/providers.ts";
import { runSender, type ClaimedMessage } from "../supabase/functions/_shared/sender.ts";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (from `npx supabase status`).");
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("send-local is for the local stack only.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const result = await runSender(
  {
    async claim(batch) {
      const { data, error } = await supabase.rpc("claim_messages", { p_channel: "sms", p_batch: batch });
      if (error) throw error;
      return data as ClaimedMessage[];
    },
    async finish(id, ok, providerId, err, segments) {
      const { error } = await supabase.rpc("finish_message", { p_id: id, p_ok: ok, p_provider_id: providerId, p_error: err, p_segments: segments });
      if (error) throw error;
    },
  },
  logProvider(),
  { defaultSender: "VELOXA" }
);
console.log(result);
