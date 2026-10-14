import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { StoreProvider, useStore } from "./store";
import { supabaseConfigured } from "./lib/supabase";
import { Spinner } from "./ui";
import Login, { Brand } from "./screens/Login";
import Onboarding from "./screens/Onboarding";
import Dashboard from "./screens/Dashboard";
import Intake from "./screens/Intake";
import Board from "./screens/Board";
import Clients from "./screens/Clients";
import Messages from "./screens/Messages";
import Settings from "./screens/Settings";
import PublicTracking from "./screens/PublicTracking";
import OrderDetail from "./components/OrderDetail";

type Tab = "dashboard" | "intake" | "board" | "clients" | "messages" | "settings";

const NAV: { key: Tab; label: string; emoji: string; hint: string }[] = [
  { key: "dashboard", label: "Overview", emoji: "📊", hint: "Today at a glance" },
  { key: "intake", label: "New Order", emoji: "🎫", hint: "Tag items at drop-off" },
  { key: "board", label: "Live Board", emoji: "🧺", hint: "Every order, every stage" },
  { key: "clients", label: "Clients", emoji: "👥", hint: "Search & full history" },
  { key: "messages", label: "Messages", emoji: "💬", hint: "SMS to customers" },
  { key: "settings", label: "Settings", emoji: "⚙️", hint: "Shop, prices, team" },
];

function Toasts() {
  const { toasts, dismissToast } = useStore();
  const color = { success: "#14b8a6", warn: "#f59e0b", info: "#3366ff", error: "#ef4444" };
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-3 w-[min(92vw,360px)]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="glass text-left rounded-2xl p-3.5 pr-4 flex gap-3 items-start animate-slide-in ring-soft shadow-xl hover:scale-[1.01] transition"
          style={{ borderLeft: `4px solid ${color[t.tone]}` }}
        >
          <span className="text-xl leading-none mt-0.5">{t.emoji}</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">{t.title}</span>
            <span className="block text-xs text-ink-soft mt-0.5 line-clamp-3">{t.body}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const TAB_KEYS = NAV.map((n) => n.key);
const initialTab = (): Tab => {
  const h = window.location.hash.replace("#", "") as Tab;
  return TAB_KEYS.includes(h) ? h : "dashboard";
};

function Shell() {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [intakeCustomer, setIntakeCustomer] = useState<string | undefined>();
  const [intakeKey, setIntakeKey] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const { orders, org, role, displayName } = useStore();
  const { memberships, setActiveOrg, signOut } = useAuth();

  // Browser back/forward and typed #hashes switch tabs too.
  useEffect(() => {
    const onHash = () => setTabState(initialTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    window.location.hash = t;
  };
  const goNewOrder = (customerId?: string) => {
    setIntakeCustomer(customerId);
    setIntakeKey((k) => k + 1); // fresh intake form
    setTab("intake");
  };
  const openOrder = orders.find((o) => o.id === openOrderId);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <aside className="lg:w-64 lg:h-screen lg:sticky lg:top-0 shrink-0 glass border-r border-white/60 flex lg:flex-col z-20 sticky top-0">
        <div className="p-4 lg:p-5">
          <Brand />
        </div>

        <nav className="hidden lg:flex flex-col gap-1 px-3 mt-2 flex-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => (n.key === "intake" ? goNewOrder() : setTab(n.key))}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                tab === n.key ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30" : "text-ink-soft hover:bg-white/70"
              }`}
            >
              <span className="text-lg">{n.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{n.label}</span>
                <span className={`block text-[10px] ${tab === n.key ? "text-white/80" : "text-slate-400"}`}>{n.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <nav className="flex lg:hidden ml-auto items-center gap-1 px-2 overflow-x-auto no-scrollbar">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => (n.key === "intake" ? goNewOrder() : setTab(n.key))}
              className={`shrink-0 grid place-items-center w-11 h-11 rounded-xl text-lg ${
                tab === n.key ? "bg-brand-500 text-white" : "text-ink-soft"
              }`}
              title={n.label}
              aria-label={n.label}
            >
              {n.emoji}
            </button>
          ))}
        </nav>

        <div className="hidden lg:block p-3 space-y-2">
          {memberships.length > 1 && (
            <select
              value={org.id}
              onChange={(e) => setActiveOrg(e.target.value)}
              className="w-full text-xs font-semibold text-ink-soft bg-white/70 rounded-xl px-2 py-2 ring-soft"
            >
              {memberships.map((m) => (
                <option key={m.org_id} value={m.org_id}>
                  {m.organizations.name}
                </option>
              ))}
            </select>
          )}
          <div className="rounded-xl bg-white/70 ring-soft px-3 py-2.5">
            <div className="text-xs font-bold text-ink truncate">{org.name}</div>
            <div className="text-[10px] text-slate-400 truncate">
              {displayName} · <span className="capitalize">{role}</span>
            </div>
            <button onClick={signOut} className="text-[11px] font-semibold text-brand-600 hover:underline mt-1">
              Sign out
            </button>
          </div>
          <div className="text-[9px] text-slate-300 text-center">A Veloxa Technology Ltd company</div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
        {tab === "dashboard" && <Dashboard onOpenBoard={() => setTab("board")} onOpen={setOpenOrderId} onNewOrder={() => goNewOrder()} />}
        {tab === "intake" && <Intake key={intakeKey} onDone={() => setTab("board")} initialCustomerId={intakeCustomer} />}
        {tab === "board" && <Board onOpen={setOpenOrderId} />}
        {tab === "clients" && <Clients onNewOrder={goNewOrder} />}
        {tab === "messages" && <Messages />}
        {tab === "settings" && (
          <>
            <Settings />
            <button onClick={signOut} className="lg:hidden mt-5 text-sm font-semibold text-brand-600">
              Sign out
            </button>
          </>
        )}
      </main>

      {openOrder && <OrderDetail order={openOrder} onClose={() => setOpenOrderId(null)} />}
      <Toasts />
    </div>
  );
}

function Gate() {
  const { session, loading, active } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Login />;
  if (!active) return <Onboarding />;
  return (
    // Remount everything when switching laundries.
    <StoreProvider key={active.org_id}>
      <Shell />
    </StoreProvider>
  );
}

function SetupNotice() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card rounded-2xl p-6 max-w-md">
        <h1 className="font-display text-xl font-bold text-ink">Supabase isn't configured</h1>
        <p className="text-sm text-ink-soft mt-2">
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>. See docs/SETUP.md.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const track = /^\/t\/([A-Za-z0-9]+)\/?$/.exec(window.location.pathname);
  if (!supabaseConfigured) return <SetupNotice />;
  if (track) return <PublicTracking token={track[1]} />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
