import { useStore } from "../store";
import { cedis, clockUntil, timeAgo } from "../lib/format";
import { STAGES, balanceOf, itemCount, nextStage, stageMeta, type Order } from "../lib/types";
import { Avatar, FlagPill, Spinner } from "../ui";

export default function Board({ onOpen }: { onOpen: (orderId: string) => void }) {
  const { orders, advance, sendReminder, loading } = useStore();
  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <div className="text-sm font-semibold text-teal-500">Operations</div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Live board</h1>
          <p className="text-ink-soft text-sm mt-1">
            Every order, every stage. When an order moves to Ready, the customer gets an SMS automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-soft bg-white/70 ring-soft rounded-full px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          Live · updates from every device
        </div>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
        {STAGES.map((stage) => {
          const col = orders.filter((o) => o.stage === stage.key);
          return (
            <div key={stage.key} className="shrink-0 w-[280px] snap-start">
              <div className="rounded-2xl px-3 py-2.5 flex items-center justify-between mb-3" style={{ background: `${stage.color}14` }}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{stage.emoji}</span>
                  <span className="font-display font-bold text-sm" style={{ color: stage.color }}>
                    {stage.label}
                  </span>
                </div>
                <span
                  className="text-xs font-bold rounded-full min-w-6 h-6 px-1.5 grid place-items-center"
                  style={{ background: stage.color, color: "#fff" }}
                >
                  {col.length}
                </span>
              </div>

              <div className="space-y-3 min-h-[80px]">
                {col.map((o) => (
                  <Card
                    key={o.id}
                    order={o}
                    onOpen={() => onOpen(o.id)}
                    onAdvance={() => advance(o.id)}
                    onRemind={() => sendReminder(o.id)}
                  />
                ))}
                {col.length === 0 && (
                  <div className="text-center text-xs text-slate-300 py-6 border-2 border-dashed border-slate-200 rounded-xl">empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  order,
  onOpen,
  onAdvance,
  onRemind,
}: {
  order: Order;
  onOpen: () => void;
  onAdvance: () => void;
  onRemind: () => void;
}) {
  const { customerById } = useStore();
  const c = customerById(order.customer_id);
  const flags = order.order_items.filter((i) => i.flag);
  const isReady = order.stage === "ready";
  const next = nextStage(order.stage);
  const balance = balanceOf(order);
  const overdue = order.stage !== "delivered" && order.stage !== "ready" && order.ready_by && new Date(order.ready_by) < new Date();

  return (
    <div className="card rounded-2xl p-3.5 animate-pop hover:shadow-lg transition">
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-center gap-2.5">
          <Avatar name={c?.name ?? "?"} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink text-sm truncate">{c?.name ?? "…"}</span>
              {c?.vip && <span className="text-[10px]">⭐</span>}
            </div>
            <div className="text-[11px] font-mono text-slate-400">{order.code}</div>
          </div>
          {order.express && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">⚡</span>}
        </div>

        <div className="flex items-center gap-2 mt-2.5 text-xs text-ink-soft">
          <span className="font-semibold text-ink">{itemCount(order)} items</span>
          <span>·</span>
          <span>{cedis(order.total)}</span>
          <span>·</span>
          <span className={balance === 0 ? "text-teal-600 font-semibold" : "text-amber-600 font-semibold"}>
            {balance === 0 ? "paid" : order.amount_paid > 0 ? `owes ${cedis(balance)}` : "unpaid"}
          </span>
        </div>

        {(flags.length > 0 || (isReady && order.reminders_sent > 0) || overdue) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {overdue && <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">⏰ overdue</span>}
            {flags.slice(0, 2).map((f) => (
              <FlagPill key={f.id} flag={f.flag!} />
            ))}
            {isReady && order.reminders_sent > 0 && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                🔔 reminded {order.reminders_sent}×
              </span>
            )}
          </div>
        )}
      </button>

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">
          {order.stage === "delivered"
            ? `done ${order.collected_at ? timeAgo(order.collected_at) : ""}`
            : isReady
            ? `ready ${order.ready_at ? timeAgo(order.ready_at) : ""}`
            : `due ${clockUntil(order.ready_by)}`}
        </span>
        <div className="flex gap-1">
          {isReady && (
            <button
              onClick={onRemind}
              title="Send a pickup reminder SMS now"
              className="text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-lg px-2 py-1 hover:bg-amber-200"
            >
              🔔 Remind
            </button>
          )}
          {next && (
            <button
              onClick={isReady && balance > 0 ? onOpen : onAdvance}
              title={isReady && balance > 0 ? "Balance due: open to take payment first" : undefined}
              className="text-[11px] font-semibold bg-ink text-white rounded-lg px-2.5 py-1 hover:opacity-90"
            >
              → {stageMeta(next).label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
