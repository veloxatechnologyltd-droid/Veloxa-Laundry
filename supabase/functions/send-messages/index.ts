// Edge Function: send queued SMS. Called every minute by pg_cron (pg_net) with
// `Authorization: Bearer <CRON_SECRET>`; see docs/MESSAGING.md "Deploying".
//
// Secrets: SMS_PROVIDER (arkesel | log), SMS_API_KEY, SMS_DEFAULT_SENDER,
// CRON_SECRET. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// With SMS_PROVIDER unset it sends nothing and leaves messages queued.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { providerFromEnv } from "../_shared/providers.ts";
import { runSender, type ClaimedMessage } from "../_shared/sender.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  let provider;
  try {
    provider = providerFromEnv((k) => Deno.env.get(k));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!provider) return Response.json({ skipped: "SMS_PROVIDER not set; messages stay queued" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const result = await runSender(
    {
      async claim(batch) {
        const { data, error } = await supabase.rpc("claim_messages", { p_channel: "sms", p_batch: batch });
        if (error) throw error;
        return data as ClaimedMessage[];
      },
      async finish(id, ok, providerId, err, segments) {
        const { error } = await supabase.rpc("finish_message", {
          p_id: id,
          p_ok: ok,
          p_provider_id: providerId,
          p_error: err,
          p_segments: segments,
        });
        if (error) console.error("finish_message", id, error);
      },
    },
    provider,
    { defaultSender: Deno.env.get("SMS_DEFAULT_SENDER") ?? "VELOXA" }
  );

  return Response.json({ provider: provider.name, ...result });
});
