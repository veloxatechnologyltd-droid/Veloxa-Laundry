// Public page the customer opens from their SMS: /t/<tracking_token>.
// No login. Data comes only from the get_tracking RPC (no table access as anon).
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { emojiFor } from "../lib/catalog";
import { cedis, fmtDate, fmtTime } from "../lib/format";
import { STAGES, stageIndex, type TrackingInfo } from "../lib/types";
import { QRTag, Spinner } from "../ui";

export default function PublicTracking({ token }: { token: string }) {
  const [info, setInfo] = useState<TrackingInfo | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = () =>
      supabase.rpc("get_tracking", { token }).then(({ data, error }) => {
        if (!alive) return;
        if (error) console.error(error);
        setInfo((data as TrackingInfo | null) ?? null);
      });
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [token]);

  if (info === undefined) return <Spinner label="Loading your order…" />;
  if (info === null)
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <div className="text-5xl mb-3">🔎</div>
          <h1 className="font-display text-xl font-bold text-ink">We couldn't find this order</h1>
          <p className="text-sm text-ink-soft mt-1">Check the link in your SMS, or call the laundry.</p>
        </div>
      </div>
    );

  const cur = stageIndex(info.stage);
  const balance = Math.max(0, info.total - info.paid);
  const itemTotal = info.items.reduce((s, i) => s + i.qty, 0);
  const done = (s: string) => info.timeline.filter((t) => t.stage === s).at(-1);

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-md mx-auto">
        <div className="rounded-[2rem] bg-white overflow-hidden shadow-2xl ring-soft animate-pop">
          <div className="bg-gradient-to-b from-brand-500 to-brand-600 px-6 pb-6 pt-5 text-white">
            <div className="text-xs opacity-90 font-semibold">🧺 {info.shop}</div>
            <div className="mt-4 text-sm opacity-90">Hi {info.customer},</div>
            <div className="font-display text-2xl font-bold">
              {info.stage === "ready"
                ? "Your laundry is ready! ✅"
                : info.stage === "delivered"
                ? "Collected. Thank you! 🎉"
                : "We're on it 🫧"}
            </div>
            <div className="mt-1 text-xs opacity-90">
              Order {info.code} · {itemTotal} items
              {info.ready_by && info.stage !== "ready" && info.stage !== "delivered" && (
                <> · expected {fmtDate(info.ready_by)} {fmtTime(info.ready_by)}</>
              )}
            </div>
          </div>

          <div className="px-6 py-5">
            {STAGES.map((s, i) => {
              const isDone = i < cur;
              const active = i === cur;
              const ev = done(s.key);
              return (
                <div key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`grid place-items-center rounded-full text-xs ${active ? "pulse-ring" : ""}`}
                      style={{
                        width: 28,
                        height: 28,
                        background: isDone || active ? s.color : "#eef1f6",
                        color: isDone || active ? "#fff" : "#c0c7d4",
                      }}
                    >
                      {isDone ? "✓" : s.emoji}
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className="w-0.5 flex-1 my-0.5" style={{ background: isDone ? s.color : "#eef1f6", minHeight: 22 }} />
                    )}
                  </div>
                  <div className={`pb-3 ${isDone || active ? "" : "opacity-40"}`}>
                    <div className="text-sm font-semibold text-ink">{s.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {ev && (isDone || active) ? `${fmtDate(ev.at)} ${fmtTime(ev.at)}` : active ? "in progress…" : "pending"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {balance > 0 ? (
            <div className="mx-5 mb-5 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm">
              <div className="font-bold text-amber-700">Balance {cedis(balance)}</div>
              <div className="text-xs text-amber-600">Pay at pickup by cash or Mobile Money.</div>
            </div>
          ) : (
            <div className="mx-5 mb-5 rounded-xl bg-teal-50 ring-1 ring-teal-200 p-3 text-center text-xs font-bold text-teal-700">
              ✓ Fully paid {cedis(info.total)}
            </div>
          )}
        </div>

        <div className="card rounded-2xl p-5 mt-5 animate-fade-up">
          <h2 className="font-display font-bold text-ink">Your items</h2>
          <p className="text-xs text-ink-soft mt-0.5">Every item is tagged to you. At pickup we check each tag against this list.</p>
          <div className="mt-3 space-y-2">
            {info.items.map((it) => (
              <div key={it.tag} className="flex items-center gap-3 rounded-xl bg-slate-50 ring-soft p-2.5">
                <QRTag value={it.tag} size={32} />
                <span className="text-xl">{emojiFor(it.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">
                    {it.type} {it.qty > 1 && <span className="text-brand-600">×{it.qty}</span>}
                  </div>
                  <div className="text-[11px] text-ink-soft">
                    <span className="font-mono text-brand-600">{it.tag}</span>
                    {it.color && ` · ${it.color}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-5">Powered by Veloxa Laundry Management</p>
      </div>
    </div>
  );
}
