import { describe, expect, it, vi } from "vitest";
import { runSender, type ClaimedMessage, type SenderDb } from "./sender.ts";
import { arkesel, logProvider, providerFromEnv, type Provider } from "./providers.ts";
import { isGsm7, smsSegments } from "./sms.ts";

const msg = (i: number, extra: Partial<ClaimedMessage> = {}): ClaimedMessage => ({
  id: `m${i}`,
  org_id: "org",
  to_phone: "+233241184477",
  body: "Kappa 7: VX-1001 is ready for pickup. Fully paid.",
  attempts: 1,
  sender_id: "KAPPA7",
  ...extra,
});

function fakeDb(batches: ClaimedMessage[][]) {
  const finished: { id: string; ok: boolean; providerId: string | null; error: string | null; segments: number | null }[] = [];
  const db: SenderDb = {
    claim: vi.fn(async () => batches.shift() ?? []),
    finish: vi.fn(async (id, ok, providerId, error, segments) => void finished.push({ id, ok, providerId, error, segments })),
  };
  return { db, finished };
}

describe("smsSegments", () => {
  it("counts GSM-7 messages", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
    expect(smsSegments("€".repeat(80))).toBe(1); // extended chars count double
    expect(smsSegments("€".repeat(81))).toBe(2);
  });
  it("switches to UCS-2 for emoji", () => {
    expect(isGsm7("Ready ✅")).toBe(false);
    expect(smsSegments("Ready ✅" + "a".repeat(63))).toBe(1); // 70 chars
    expect(smsSegments("Ready ✅" + "a".repeat(64))).toBe(2);
    expect(smsSegments("🎉".repeat(35))).toBe(1); // emoji outside the BMP count as 2
  });
  it("keeps our real SMS wording in one GSM-7 segment", () => {
    const s = "Kappa 7 Laundry & Dry Cleaning: Reminder, KP-1001 is ready for pickup. Balance: GHS 123.50.";
    expect(isGsm7(s)).toBe(true);
    expect(smsSegments(s)).toBe(1);
  });
});

describe("runSender", () => {
  it("sends, records provider id + segments, and counts failures", async () => {
    const { db, finished } = fakeDb([[msg(1), msg(2), msg(3, { to_phone: "+233200000003" })]]);
    const provider: Provider = {
      name: "fake",
      send: vi.fn(async ({ to }) => (to.endsWith("3") ? { ok: true as const, id: "p" } : { ok: false as const, error: "bad" })),
    };
    const r = await runSender(db, provider, { defaultSender: "VELOXA", batch: 50 });
    expect(r).toEqual({ sent: 1, failed: 2 });
    expect(finished.find((f) => f.id === "m3")).toEqual({ id: "m3", ok: true, providerId: "p", error: null, segments: 1 });
    expect(finished.filter((f) => !f.ok).every((f) => f.error === "bad" && f.segments === null)).toBe(true);
  });

  it("treats a throwing provider as a failure and keeps going", async () => {
    const { db, finished } = fakeDb([[msg(1), msg(2, { to_phone: "+233200000003" })]]);
    const provider: Provider = {
      name: "fake",
      send: async ({ to }) => {
        if (to.endsWith("77")) throw new Error("network down");
        return { ok: true, id: "p2" };
      },
    };
    const r = await runSender(db, provider, { defaultSender: "VELOXA" });
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(finished.find((f) => f.id === "m1")).toMatchObject({ ok: false, error: "network down" });
    expect(finished.find((f) => f.id === "m2")).toMatchObject({ ok: true, providerId: "p2", segments: 1 });
  });

  it("uses the org sender ID, falling back to the default when missing or invalid", async () => {
    const { db } = fakeDb([[msg(1), msg(2, { sender_id: null }), msg(3, { sender_id: "WAY TOO LONG ID" })]]);
    const send = vi.fn(async () => ({ ok: true as const }));
    await runSender(db, { name: "fake", send }, { defaultSender: "VELOXA" });
    expect(send.mock.calls.map((c) => (c as unknown as [{ sender: string }])[0].sender)).toEqual(["KAPPA7", "VELOXA", "VELOXA"]);
  });

  it("keeps claiming full batches up to maxBatches", async () => {
    const { db } = fakeDb([[msg(1), msg(2)], [msg(3), msg(4)], [msg(5)]]);
    const r = await runSender(db, logProvider(() => {}), { defaultSender: "VELOXA", batch: 2, maxBatches: 2 });
    expect(r.sent).toBe(4);
    expect(db.claim).toHaveBeenCalledTimes(2);
  });

  it("stops when a batch comes back short", async () => {
    const { db } = fakeDb([[msg(1)], [msg(2)]]);
    await runSender(db, logProvider(() => {}), { defaultSender: "VELOXA", batch: 2 });
    expect(db.claim).toHaveBeenCalledTimes(1);
  });
});

describe("providers", () => {
  it("arkesel posts the documented payload and reads the message id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "success", data: [{ recipient: "233241184477", id: "ark-1" }] })));
    const r = await arkesel("KEY", fetchMock as unknown as typeof fetch).send({ to: "+233241184477", body: "hi", sender: "KAPPA7" });
    expect(r).toEqual({ ok: true, id: "ark-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sms.arkesel.com/api/v2/sms/send");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("KEY");
    expect(JSON.parse(init.body as string)).toEqual({ sender: "KAPPA7", message: "hi", recipients: ["233241184477"] });
  });

  it("arkesel reports errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "error", message: "Invalid sender" }), { status: 422 }));
    const r = await arkesel("KEY", fetchMock as unknown as typeof fetch).send({ to: "+233241184477", body: "hi", sender: "X" });
    expect(r).toEqual({ ok: false, error: "arkesel 422: Invalid sender" });
  });

  it("picks the provider from env", () => {
    expect(providerFromEnv(() => undefined)).toBeNull();
    expect(providerFromEnv((k) => ({ SMS_PROVIDER: "log" })[k])?.name).toBe("log");
    expect(() => providerFromEnv((k) => ({ SMS_PROVIDER: "arkesel" })[k])).toThrow("SMS_API_KEY");
    expect(() => providerFromEnv((k) => ({ SMS_PROVIDER: "twilio" })[k])).toThrow("Unknown");
  });
});
