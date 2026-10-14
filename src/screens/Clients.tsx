import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { supabase, friendlyError } from "../lib/supabase";
import { emojiFor } from "../lib/catalog";
import { cedis, fmtDate, fmtMonth, prettyPhone } from "../lib/format";
import { balanceOf, itemCount, stageMeta, type Customer, type Order } from "../lib/types";
import { Avatar, FlagPill, ItemThumb, Spinner, StageBadge, StageTrack } from "../ui";
import AddClientModal from "../components/AddClientModal";
import OrderDetail from "../components/OrderDetail";

export default function Clients({ onNewOrder }: { onNewOrder: (customerId?: string) => void }) {
  const { customers, orders, loading } = useStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);

  const activeCount = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => o.stage !== "delivered" && m.set(o.customer_id, (m.get(o.customer_id) ?? 0) + 1));
    return m;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits)));
  }, [query, customers]);

  if (loading) return <Spinner />;
  const selected = customers.find((c) => c.id === selectedId) ?? filtered[0];

  return (
    <div className="space-y-5">
      <header className="animate-fade-up">
        <div className="text-sm font-semibold text-teal-500">Directory</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Clients</h1>
        <p className="text-ink-soft text-sm mt-1">Find anyone at the counter in a second and see every order they've left.</p>
      </header>

      <div className="grid lg:grid-cols-[330px_1fr] gap-5 items-start">
        <div className="card rounded-2xl p-3 animate-fade-up lg:sticky lg:top-6">
          <div className="relative mb-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full bg-slate-50 ring-soft rounded-xl pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold text-slate-400">
              {filtered.length} {filtered.length === 1 ? "client" : "clients"}
            </span>
            <button onClick={() => setAdding(true)} className="text-[11px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg px-2 py-1 transition">
              ＋ Add client
            </button>
          </div>
          <div className="space-y-1 max-h-[62vh] overflow-y-auto">
            {filtered.map((c) => {
              const active = activeCount.get(c.id) ?? 0;
              const sel = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 rounded-xl p-2.5 text-left transition ${
                    sel ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={c.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold text-sm truncate ${sel ? "text-white" : "text-ink"}`}>{c.name}</span>
                      {c.vip && <span className="text-[10px]">⭐</span>}
                    </div>
                    <div className={`text-[11px] truncate ${sel ? "text-white/80" : "text-ink-soft"}`}>{prettyPhone(c.phone)}</div>
                  </div>
                  {active > 0 && (
                    <span
                      className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                        sel ? "bg-white/25 text-white" : "bg-teal-100 text-teal-700"
                      }`}
                    >
                      {active} active
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-sm text-ink-soft text-center py-8">
                {customers.length === 0 ? "No clients yet." : `No client matches “${query}”.`}
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <ClientDetail key={selected.id} customer={selected} onNewOrder={onNewOrder} />
        ) : (
          <div className="card rounded-2xl p-10 text-center animate-fade-up">
            <div className="text-4xl mb-2">👥</div>
            <div className="font-semibold text-ink">Your client list is empty</div>
            <button onClick={() => setAdding(true)} className="mt-4 bg-brand-500 text-white text-sm font-semibold rounded-xl px-5 py-2.5">
              ＋ Add your first client
            </button>
          </div>
        )}
      </div>

      {adding && (
        <AddClientModal
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            setQuery("");
            setSelectedId(c.id);
          }}
        />
      )}
    </div>
  );
}

function ClientDetail({ customer, onNewOrder }: { customer: Customer; onNewOrder: (customerId?: string) => void }) {
  const { loadCustomerOrders, orders: liveOrders, refresh, toast } = useStore();
  const [history, setHistory] = useState<Order[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Reload history when this client's live orders change (stage moves, payments).
  const liveKey = liveOrders
    .filter((o) => o.customer_id === customer.id)
    .map((o) => `${o.id}:${o.stage}:${o.amount_paid}`)
    .join(",");
  useEffect(() => {
    loadCustomerOrders(customer.id).then(setHistory);
  }, [customer.id, loadCustomerOrders, liveKey]);

  const orders = history ?? [];
  const active = orders.filter((o) => o.stage !== "delivered");
  const totalSpent = orders.reduce((s, o) => s + o.amount_paid, 0);
  const totalItems = orders.reduce((s, o) => s + itemCount(o), 0);
  const outstanding = orders.reduce((s, o) => s + balanceOf(o), 0);
  const openOrder = orders.find((o) => o.id === openId);

  const toggle = async (field: "vip" | "sms_opt_out") => {
    const { error } = await supabase.from("customers").update({ [field]: !customer[field] }).eq("id", customer.id);
    if (error) toast({ title: "Couldn't update client", body: friendlyError(error), emoji: "⚠️", tone: "error" });
    else refresh();
  };

  return (
    <div className="space-y-5">
      {openOrder && <OrderDetail order={openOrder} onClose={() => setOpenId(null)} />}
      <div className="card rounded-2xl p-5 animate-fade-up relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-gradient-to-br from-brand-500/10 to-teal-500/10 blur-2xl" />
        <div className="flex flex-wrap items-center gap-4 relative">
          <Avatar name={customer.name} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl font-bold text-ink">{customer.name}</h2>
              {customer.vip && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded px-2 py-0.5">⭐ VIP</span>}
              {customer.sms_opt_out && <span className="text-[10px] font-bold text-slate-600 bg-slate-100 rounded px-2 py-0.5">📵 No SMS</span>}
            </div>
            <div className="text-sm text-ink-soft">
              {prettyPhone(customer.phone)} · client since {fmtMonth(customer.created_at)}
            </div>
            <div className="flex gap-3 mt-1 text-[11px]">
              <button onClick={() => toggle("vip")} className="text-brand-600 font-semibold hover:underline">
                {customer.vip ? "Remove VIP" : "Mark VIP"}
              </button>
              <button onClick={() => toggle("sms_opt_out")} className="text-brand-600 font-semibold hover:underline">
                {customer.sms_opt_out ? "Allow SMS" : "Stop SMS"}
              </button>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <a
              href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="bg-[#25d366] text-white text-sm font-semibold rounded-xl px-4 py-2.5 flex items-center gap-1.5 hover:opacity-90 transition"
            >
              💬 WhatsApp
            </a>
            <button onClick={() => onNewOrder(customer.id)} className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition">
              🎫 New order
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 relative">
          <Stat label="Total orders" value={String(orders.length)} sub={`${totalItems} items all-time`} />
          <Stat label="Total paid" value={cedis(totalSpent)} sub="all payments" accent="#10b981" />
          <Stat label="Active now" value={String(active.length)} sub={active.length ? "in the shop" : "none"} accent="#14b8a6" />
          <Stat label="Outstanding" value={cedis(outstanding)} sub={outstanding ? "unpaid" : "all settled"} accent={outstanding ? "#f59e0b" : "#8b5cf6"} />
        </div>
      </div>

      {active.map((o) => (
        <div key={o.id} className="card rounded-2xl p-5 animate-fade-up ring-2 ring-teal-200">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-teal-600 bg-teal-100 rounded-full px-2.5 py-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" /> CURRENT ORDER
              </span>
              <span className="font-mono text-sm font-bold text-ink">{o.code}</span>
            </div>
            {o.express && <span className="text-xs text-amber-600 font-semibold">⚡ Express</span>}
          </div>
          <div className="mt-5 overflow-x-auto no-scrollbar">
            <div className="min-w-[480px]">
              <StageTrack current={o.stage} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-5 gap-3 flex-wrap">
            <div className="text-sm text-ink-soft">
              {itemCount(o)} items · {cedis(o.total)} ·{" "}
              <span className={balanceOf(o) === 0 ? "text-teal-600 font-semibold" : "text-amber-600 font-semibold"}>
                {balanceOf(o) === 0 ? "paid" : `${cedis(balanceOf(o))} due`}
              </span>
            </div>
            <button onClick={() => setOpenId(o.id)} className="bg-ink text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition">
              Open order
            </button>
          </div>
        </div>
      ))}

      <div className="card rounded-2xl p-5 animate-fade-up">
        <h3 className="font-display font-bold text-ink mb-3">
          Order history <span className="text-ink-soft font-medium text-sm">· {orders.length} total</span>
        </h3>
        {history === null ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">🧺</div>
            <div className="text-sm font-semibold text-ink">No orders yet</div>
            <button
              onClick={() => onNewOrder(customer.id)}
              className="mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-brand-500/30 transition"
            >
              🎫 Start their first order
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const m = stageMeta(order.stage);
  const bal = balanceOf(order);

  return (
    <div className="rounded-xl ring-soft bg-white overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition">
        <div className="grid place-items-center w-10 h-10 rounded-lg text-lg shrink-0" style={{ background: `${m.color}18` }}>
          {m.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{order.code}</span>
            {order.express && <span className="text-[10px]">⚡</span>}
          </div>
          <div className="text-xs text-ink-soft">
            {fmtDate(order.created_at)} · {itemCount(order)} items
          </div>
        </div>
        <div className="hidden sm:flex items-center -space-x-1 mr-1">
          {order.order_items.slice(0, 4).map((it) => (
            <span key={it.id} className="w-6 h-6 rounded-full bg-white ring-1 ring-black/5 grid place-items-center text-xs" title={it.type}>
              {emojiFor(it.type)}
            </span>
          ))}
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-ink text-sm">{cedis(order.total)}</div>
          <div className={`text-[11px] font-semibold ${bal === 0 ? "text-teal-600" : "text-amber-600"}`}>{bal === 0 ? "paid" : `${cedis(bal)} due`}</div>
        </div>
        <span className="hidden sm:inline">
          <StageBadge stage={order.stage} sm />
        </span>
        <span className={`text-slate-300 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3 animate-fade-up">
          <div className="grid sm:grid-cols-2 gap-2">
            {order.order_items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 bg-white rounded-lg ring-soft p-2">
                <ItemThumb path={it.photo_path} emoji={emojiFor(it.type)} colorHex={it.color_hex} alt={it.type} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink truncate">
                    {it.type} {it.qty > 1 && <span className="text-brand-600">×{it.qty}</span>}
                  </div>
                  <div className="font-mono text-[10px] text-brand-600">{it.tag}</div>
                </div>
                {it.flag && <FlagPill flag={it.flag} />}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2">
            <button onClick={onOpen} className="text-xs font-semibold text-brand-600 hover:underline">
              Open full order →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 ring-soft p-3">
      <div className="text-[11px] font-semibold text-ink-soft">{label}</div>
      <div className="font-display text-lg font-bold mt-0.5" style={{ color: accent ?? "#0e1424" }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
