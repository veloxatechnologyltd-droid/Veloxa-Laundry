import { useStore } from "../store";
import { cedis, firstName } from "../lib/format";
import { balanceOf, itemCount, type Order } from "../lib/types";
import { Avatar, Spinner, StageBadge, StatCard } from "../ui";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard({
  onOpenBoard,
  onOpen,
  onNewOrder,
}: {
  onOpenBoard: () => void;
  onOpen: (orderId: string) => void;
  onNewOrder: () => void;
}) {
  const { orders, todayPayments, customerById, advance, org, displayName, loading } = useStore();
  if (loading) return <Spinner />;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = orders.filter((o) => o.stage !== "delivered");
  const ready = orders.filter((o) => o.stage === "ready");
  const inProgress = active.filter((o) => o.stage !== "ready");
  const droppedToday = orders.filter((o) => new Date(o.created_at) >= today);
  const takings = todayPayments.reduce((s, p) => s + p.amount, 0);
  const outstanding = active.reduce((s, o) => s + balanceOf(o), 0);
  const itemsInShop = active.reduce((s, o) => s + itemCount(o), 0);

  const attention: { order: Order; reason: string; tone: string }[] = [];
  for (const o of active) {
    if (o.stage === "ready" && balanceOf(o) > 0) attention.push({ order: o, reason: `Ready, ${cedis(balanceOf(o))} due`, tone: "#f59e0b" });
    else if (o.ready_by && new Date(o.ready_by) < new Date() && o.stage !== "ready")
      attention.push({ order: o, reason: "Past its promised time", tone: "#ef4444" });
    else if (o.stage === "received") attention.push({ order: o, reason: "Dropped off, not started", tone: "#3366ff" });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <div className="text-sm font-semibold text-teal-500">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mt-0.5">
            {greeting()}, {firstName(displayName)} 👋
          </h1>
          <p className="text-ink-soft text-sm mt-1">
            Here's how <span className="font-semibold">{org.name}</span> is doing today.
          </p>
        </div>
        <button onClick={onNewOrder} className="bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl px-5 py-3 shadow-lg shadow-brand-500/30 transition flex items-center gap-2">
          <span className="text-lg">🎫</span> New drop-off
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard emoji="🧺" accent="#3366ff" label="Active orders" value={String(active.length)} sub={`${itemsInShop} items in the shop`} />
        <StatCard emoji="⏳" accent="#8b5cf6" label="In progress" value={String(inProgress.length)} sub={`${droppedToday.length} dropped off today`} />
        <StatCard emoji="✅" accent="#14b8a6" label="Ready for pickup" value={String(ready.length)} sub="customers notified" />
        <StatCard emoji="💰" accent="#10b981" label="Takings today" value={cedis(takings)} sub={`${todayPayments.length} payments`} />
        <StatCard emoji="🧾" accent="#f59e0b" label="Outstanding" value={cedis(outstanding)} sub="on open orders" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card rounded-2xl p-5 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-ink">Active orders</h2>
            <button onClick={onOpenBoard} className="text-xs font-semibold text-brand-600 hover:underline">
              Open live board →
            </button>
          </div>
          {active.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">🧺</div>
              <div className="text-sm font-semibold text-ink">No orders in the shop</div>
              <div className="text-xs text-ink-soft mt-1">Log your first drop-off to see it here.</div>
            </div>
          ) : (
            <div className="space-y-1">
              {active.slice(0, 12).map((o) => {
                const c = customerById(o.customer_id);
                const bal = balanceOf(o);
                return (
                  <div key={o.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-slate-50 transition group">
                    <button onClick={() => onOpen(o.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                      <Avatar name={c?.name ?? "?"} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-sm truncate">{c?.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{o.code}</span>
                        </div>
                        <div className="text-xs text-ink-soft truncate">
                          {itemCount(o)} items · {cedis(o.total)} ·{" "}
                          {bal === 0 ? <span className="text-teal-600 font-semibold">paid</span> : <span className="text-amber-600 font-semibold">{cedis(bal)} due</span>}
                        </div>
                      </div>
                    </button>
                    <StageBadge stage={o.stage} sm />
                    {o.stage !== "ready" && (
                      <button
                        onClick={() => advance(o.id)}
                        className="hidden sm:block opacity-0 group-hover:opacity-100 transition text-xs font-semibold bg-ink text-white rounded-lg px-3 py-1.5"
                      >
                        Advance →
                      </button>
                    )}
                  </div>
                );
              })}
              {active.length > 12 && (
                <button onClick={onOpenBoard} className="w-full text-xs font-semibold text-brand-600 py-2 hover:underline">
                  + {active.length - 12} more on the board
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card rounded-2xl p-5 animate-fade-up self-start">
          <h2 className="font-display font-bold text-ink flex items-center gap-2 mb-3">
            <span className="grid place-items-center w-6 h-6 rounded-lg bg-amber-100">🔔</span>
            Needs attention
          </h2>
          <div className="space-y-2.5">
            {attention.slice(0, 8).map(({ order, reason, tone }) => {
              const c = customerById(order.customer_id);
              return (
                <button
                  key={order.id}
                  onClick={() => onOpen(order.id)}
                  className="w-full text-left rounded-xl p-3 ring-soft hover:ring-2 transition"
                  style={{ background: `${tone}0d` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{c?.name}</span>
                    <span className="text-[11px] font-mono text-slate-400">{order.code}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: tone }}>
                    {reason}
                  </div>
                </button>
              );
            })}
            {attention.length === 0 && (
              <div className="text-sm text-ink-soft py-6 text-center">🎉 All caught up. Nothing needs you right now.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
