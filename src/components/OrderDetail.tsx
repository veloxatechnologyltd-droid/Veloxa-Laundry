// Staff view of one order: manifest with photos, stage timeline, payments,
// and actions. Opened from the board, dashboard and client history.
import { useState } from "react";
import { useStore } from "../store";
import { emojiFor } from "../lib/catalog";
import { cedis, clockUntil, fmtDate, fmtTime, prettyPhone, timeAgo } from "../lib/format";
import { PAY_METHODS, STAGES, balanceOf, itemCount, nextStage, stageIndex, stageMeta, type Order } from "../lib/types";
import { Avatar, FlagPill, ItemThumb, Modal, QRTag, StageBadge, StageTrack, secondaryBtn } from "../ui";
import PaymentModal from "./PaymentModal";

export const trackingUrl = (o: Pick<Order, "tracking_token">) => `${window.location.origin}/t/${o.tracking_token}`;

export default function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const { customerById, serviceById, advance, setStage, sendReminder, toast, role } = useStore();
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = customerById(order.customer_id);
  const balance = balanceOf(order);
  const next = nextStage(order.stage);
  const canRewind = role !== "staff" && stageIndex(order.stage) > 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl(order));
      toast({ title: "Tracking link copied", body: trackingUrl(order), emoji: "🔗", tone: "success" });
    } catch {
      window.prompt("Copy the tracking link:", trackingUrl(order));
    }
  };

  if (paying) return <PaymentModal order={order} onClose={() => setPaying(false)} />;

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Avatar name={c?.name ?? "?"} size={48} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-ink text-lg">{order.code}</span>
              {order.express && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">⚡ Express</span>
              )}
            </div>
            <div className="text-sm text-ink-soft">
              {c?.name} {c && <>· {prettyPhone(c.phone)}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StageBadge stage={order.stage} />
          <button onClick={onClose} className="text-slate-400 hover:text-ink text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto no-scrollbar">
        <div className="min-w-[480px]">
          <StageTrack current={order.stage} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        {next && (
          <button
            disabled={busy}
            onClick={() => run(() => advance(order.id))}
            className="bg-ink text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-40"
          >
            → {stageMeta(next).label}
          </button>
        )}
        {balance > 0 && (
          <button
            onClick={() => setPaying(true)}
            className="bg-teal-500 text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90"
          >
            💰 Take payment
          </button>
        )}
        {order.stage === "ready" && (
          <button
            disabled={busy}
            onClick={() => run(() => sendReminder(order.id))}
            className="bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg px-4 py-2 hover:bg-amber-200 disabled:opacity-40"
          >
            🔔 Remind{order.reminders_sent > 0 && ` (${order.reminders_sent} sent)`}
          </button>
        )}
        <button onClick={copyLink} className="bg-white ring-soft text-ink-soft text-sm font-semibold rounded-lg px-4 py-2 hover:bg-slate-50">
          🔗 Copy tracking link
        </button>
        {canRewind && (
          <select
            value=""
            onChange={(e) => e.target.value && run(() => setStage(order.id, e.target.value as Order["stage"]))}
            className="bg-white ring-soft text-ink-soft text-sm font-semibold rounded-lg px-3 py-2"
            title="Move back to an earlier stage (managers only)"
          >
            <option value="">↩ Move back…</option>
            {STAGES.slice(0, stageIndex(order.stage)).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {balance > 0 && order.stage === "ready" && (
        <div className="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠️ Balance of <span className="font-bold">{cedis(balance)}</span> is due before handover.
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_220px] gap-5 mt-6">
        {/* manifest */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-bold text-ink">
              {itemCount(order)} items <span className="text-ink-soft font-medium text-sm">· {order.order_items.length} lines</span>
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {order.order_items.map((it) => (
              <div key={it.id} className="rounded-xl bg-slate-50 ring-soft p-2.5 flex gap-2.5">
                <div className="relative">
                  <ItemThumb path={it.photo_path} emoji={emojiFor(it.type)} colorHex={it.color_hex} alt={it.type} size={52} />
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-md p-0.5 shadow ring-soft">
                    <QRTag value={it.tag} size={20} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink truncate">
                    {it.type} {it.qty > 1 && <span className="text-brand-600">×{it.qty}</span>}
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-brand-600">{it.tag}</div>
                  <div className="text-[11px] text-ink-soft">
                    {it.color_name} · {serviceById(it.service_id)?.label ?? "Service"} · {cedis(it.unit_price * it.qty)}
                  </div>
                  {it.flag && (
                    <div className="mt-1">
                      <FlagPill flag={it.flag} />
                    </div>
                  )}
                  {it.note && <div className="text-[11px] text-slate-500 italic mt-1">“{it.note}”</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* side: money + timeline */}
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 ring-soft p-3 text-sm space-y-1">
            <Row label="Total" value={cedis(order.total)} />
            <Row label="Paid" value={cedis(order.amount_paid)} accent="#0d9488" />
            <Row label="Balance" value={cedis(balance)} accent={balance > 0 ? "#d97706" : undefined} bold />
            {order.payments.length > 0 && (
              <div className="pt-2 mt-2 border-t border-dashed space-y-1">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-[11px] text-ink-soft">
                    <span>
                      {PAY_METHODS.find((m) => m.key === p.method)?.emoji} {fmtDate(p.received_at)}
                      {p.reference && <span className="text-slate-400"> · {p.reference}</span>}
                    </span>
                    <span className="font-semibold">{cedis(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 ring-soft p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Timeline</div>
            <div className="space-y-1.5">
              {order.order_events.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span>{stageMeta(e.stage).emoji}</span>
                  <span className="font-semibold text-ink flex-1">{stageMeta(e.stage).label}</span>
                  <span className="text-slate-400" title={new Date(e.at).toLocaleString()}>
                    {fmtTime(e.at)} · {timeAgo(e.at)}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-3">
              {order.stage === "delivered"
                ? `Collected ${order.collected_at ? fmtDate(order.collected_at) : ""}`
                : `Due ${clockUntil(order.ready_by)}`}
            </div>
          </div>
          <button onClick={onClose} className={`${secondaryBtn} w-full`}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, accent, bold }: { label: string; value: string; accent?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={bold ? "font-bold" : "font-semibold"} style={{ color: accent ?? "#0e1424" }}>
        {value}
      </span>
    </div>
  );
}
