// SMS providers behind one interface, so the gateway can be swapped by
// changing the SMS_PROVIDER secret. Add a provider = add one object here.

import { msisdn } from "./sms.ts";

export interface OutgoingSms {
  to: string; // E.164
  body: string;
  sender: string; // registered sender ID, max 11 chars
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export interface Provider {
  name: string;
  /** True for providers that don't really deliver (the UI marks these as test sends). */
  test?: boolean;
  send(msg: OutgoingSms): Promise<SendResult>;
}

type Fetch = typeof fetch;

/**
 * Arkesel SMS API v2 (https://developers.arkesel.com).
 * NOTE: written from the public docs; verify with a real account (test number,
 * registered sender ID) before the first live send.
 */
export function arkesel(apiKey: string, fetchImpl: Fetch = fetch): Provider {
  return {
    name: "arkesel",
    async send({ to, body, sender }) {
      const res = await fetchImpl("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender, message: body, recipients: [msisdn(to)] }),
      });
      const text = await res.text();
      let json: { status?: string; message?: string; data?: { id?: string }[] } = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
      if (res.ok && json.status === "success") return { ok: true, id: json.data?.[0]?.id };
      return { ok: false, error: `arkesel ${res.status}: ${json.message ?? text.slice(0, 200)}` };
    },
  };
}

/** Sends nothing; logs the SMS. For local development and staging only. */
export function logProvider(log: (line: string) => void = console.log): Provider {
  return {
    name: "log",
    test: true,
    async send({ to, body, sender }) {
      log(`[sms:log] ${sender} → ${to}: ${body}`);
      return { ok: true, id: `log:${crypto.randomUUID()}` };
    },
  };
}

export function providerFromEnv(env: (k: string) => string | undefined): Provider | null {
  const name = env("SMS_PROVIDER");
  if (!name) return null;
  if (name === "log") return logProvider();
  if (name === "arkesel") {
    const key = env("SMS_API_KEY");
    if (!key) throw new Error("SMS_API_KEY is not set");
    return arkesel(key);
  }
  throw new Error(`Unknown SMS_PROVIDER "${name}"`);
}
