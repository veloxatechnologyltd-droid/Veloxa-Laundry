import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type DraftItem } from "../store";
import { downscalePhoto } from "../lib/photo";
import { CATALOG, COLORS, EXPRESS_MULTIPLIER, emojiFor } from "../lib/catalog";
import { cedis, prettyPhone } from "../lib/format";
import { itemCount, type Order } from "../lib/types";
import { Avatar, FlagPill, QRTag, Spinner, primaryBtn, secondaryBtn } from "../ui";
import AddClientModal from "../components/AddClientModal";

export default function Intake({
  onDone,
  initialCustomerId,
}: {
  onDone: () => void;
  initialCustomerId?: string;
}) {
  const { createOrder, customers, customerById, services, loading } = useStore();
  const activeServices = services.filter((s) => s.active);
  const [customerId, setCustomerId] = useState<string | undefined>(initialCustomerId);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [express, setExpress] = useState(false);
  const [created, setCreated] = useState<Order | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [customType, setCustomType] = useState("");
  const [busy, setBusy] = useState(false);

  // Release photo previews when items go away.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.photoPreview && URL.revokeObjectURL(i.photoPreview)), []);

  // Photo capture: one hidden input reused for whichever item is being shot.
  const fileRef = useRef<HTMLInputElement>(null);
  const captureKey = useRef<string | null>(null);
  const openCamera = (key: string) => {
    captureKey.current = key;
    fileRef.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = captureKey.current;
    e.target.value = "";
    if (!file || !key) return;
    try {
      const photo = await downscalePhoto(file);
      setItems((prev) =>
        prev.map((it) => {
          if (it.key !== key) return it;
          if (it.photoPreview) URL.revokeObjectURL(it.photoPreview);
          return { ...it, photo, photoPreview: URL.createObjectURL(photo) };
        })
      );
    } catch {
      /* unreadable image: ignore */
    }
  };

  const defaultServiceId = (label?: string) =>
    (activeServices.find((s) => s.label === label) ?? activeServices[0])?.id ?? "";

  const addItem = (type: string, serviceLabel?: string) =>
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        type,
        serviceId: defaultServiceId(serviceLabel),
        qty: 1,
        colorHex: "#ffffff",
        colorName: "White",
      },
    ]);

  const update = (key: string, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const remove = (key: string) =>
    setItems((prev) => {
      const gone = prev.find((i) => i.key === key);
      if (gone?.photoPreview) URL.revokeObjectURL(gone.photoPreview);
      return prev.filter((i) => i.key !== key);
    });

  const priceOf = (id: string) => services.find((s) => s.id === id)?.price ?? 0;
  const subtotal = items.reduce((s, it) => s + priceOf(it.serviceId) * it.qty, 0);
  const total = express ? Math.round(subtotal * EXPRESS_MULTIPLIER) : subtotal;
  const totalItems = items.reduce((s, it) => s + it.qty, 0);
  const customer = customerId ? customerById(customerId) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits)))
      .slice(0, 8);
  }, [customers, query]);

  const submit = async () => {
    if (!customerId || items.length === 0 || busy) return;
    setBusy(true);
    const order = await createOrder({ customerId, express, items });
    setBusy(false);
    if (order) setCreated(order);
  };

  const reset = () => {
    items.forEach((i) => i.photoPreview && URL.revokeObjectURL(i.photoPreview));
    setCreated(null);
    setItems([]);
    setExpress(false);
    setCustomerId(undefined);
    setQuery("");
  };

  if (loading) return <Spinner />;

  // --- Success / tag sheet ---
  if (created) {
    return (
      <div className="max-w-3xl mx-auto animate-pop">
        <div className="card rounded-3xl p-6 sm:p-8 text-center">
          <div className="text-5xl mb-2 animate-drift">🎫</div>
          <h1 className="font-display text-2xl font-bold text-ink">Order {created.code} created & tagged</h1>
          <p className="text-ink-soft mt-1">
            {itemCount(created)} items · every line carries a tag linked to{" "}
            <span className="font-semibold">{customer?.name}</span>. They'll get an SMS when it's ready.
          </p>

          <div className="mt-6 bg-slate-50 rounded-2xl p-5 ring-soft">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Write or print these tags, one per garment line
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {created.order_items.map((it, i) => (
                <div key={it.id} className="bg-white rounded-xl p-3 ring-soft flex items-center gap-3 text-left">
                  {items[i]?.photoPreview ? (
                    <img src={items[i].photoPreview} alt={it.type} className="w-14 h-14 rounded-lg object-cover ring-1 ring-black/10 shrink-0" />
                  ) : (
                    <QRTag value={it.tag} size={56} />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-brand-600">{it.tag}</div>
                    <div className="text-sm font-semibold text-ink truncate">
                      {emojiFor(it.type)} {it.type} {it.qty > 1 && `×${it.qty}`}
                    </div>
                    <div className="text-[11px] text-ink-soft">
                      {it.color_name} · {services.find((s) => s.id === it.service_id)?.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-sm text-ink-soft">
            Total <span className="font-bold text-ink">{cedis(created.total)}</span> · ready by{" "}
            {created.ready_by && new Date(created.ready_by).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </div>

          <div className="flex gap-3 mt-6 justify-center flex-wrap">
            <button onClick={onDone} className={primaryBtn}>
              See it on the board →
            </button>
            <button onClick={reset} className={secondaryBtn}>
              New drop-off
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      {addingClient && <AddClientModal onClose={() => setAddingClient(false)} onCreated={(c) => setCustomerId(c.id)} />}
      <header className="animate-fade-up">
        <div className="text-sm font-semibold text-teal-500">Front desk</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">New drop-off</h1>
        <p className="text-ink-soft text-sm mt-1">
          Log every item as it comes in. Each garment line gets its own tag, so clothes never get mixed up.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <div className="card rounded-2xl p-5 animate-fade-up">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">1 · Customer</label>
              <button
                onClick={() => setAddingClient(true)}
                className="text-[11px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg px-2 py-1 transition"
              >
                ＋ New client
              </button>
            </div>
            {customer ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-teal-50 ring-1 ring-teal-100 px-3 py-2.5">
                <Avatar name={customer.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm">
                    {customer.name} {customer.vip && "⭐"}
                  </div>
                  <div className="text-xs text-ink-soft">{prettyPhone(customer.phone)}</div>
                </div>
                <button onClick={() => setCustomerId(undefined)} className="text-xs font-semibold text-brand-600 hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or phone…"
                    className="w-full bg-slate-50 ring-soft rounded-xl pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCustomerId(c.id)}
                      className="flex items-center gap-2 rounded-xl pl-1.5 pr-3 py-1.5 bg-white ring-soft text-ink-soft hover:bg-slate-50 transition"
                    >
                      <Avatar name={c.name} size={28} />
                      <span className="text-sm font-semibold">{c.name}</span>
                      {c.vip && <span className="text-[10px]">⭐</span>}
                    </button>
                  ))}
                  <button
                    onClick={() => setAddingClient(true)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 border-2 border-dashed border-slate-200 text-slate-400 hover:border-brand-300 hover:text-brand-500 transition text-sm font-semibold"
                  >
                    ＋ New
                  </button>
                </div>
                {customers.length === 0 && (
                  <div className="text-xs text-ink-soft mt-2">No clients yet. Add your first one to start an order.</div>
                )}
              </>
            )}
          </div>

          {/* Catalog */}
          <div className="card rounded-2xl p-5 animate-fade-up">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">2 · Add items</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-3">
              {CATALOG.map((c) => (
                <button
                  key={c.type}
                  onClick={() => addItem(c.type, c.service)}
                  className="flex flex-col items-center gap-1 rounded-xl p-3 bg-white ring-soft hover:bg-brand-50 hover:-translate-y-0.5 transition"
                >
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-[11px] font-semibold text-ink text-center leading-tight">{c.type}</span>
                </button>
              ))}
            </div>
            <form
              className="flex gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!customType.trim()) return;
                addItem(customType.trim());
                setCustomType("");
              }}
            >
              <input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Something else? e.g. Curtains"
                className="flex-1 bg-slate-50 ring-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button type="submit" className="text-sm font-semibold bg-white ring-soft rounded-xl px-3 hover:bg-slate-50">
                ＋ Add
              </button>
            </form>
          </div>

          {/* Item list */}
          <div className="card rounded-2xl p-5 animate-fade-up min-h-[120px]">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">3 · Detail each item</label>
            {items.length === 0 ? (
              <div className="text-sm text-ink-soft py-8 text-center">👆 Tap items above to add them to this order.</div>
            ) : (
              <div className="space-y-2 mt-3">
                {items.map((it, i) => (
                  <div key={it.key} className="rounded-xl bg-slate-50 p-3 ring-soft animate-pop">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openCamera(it.key)}
                        title={it.photo ? "Retake photo" : "Take or upload a photo"}
                        className="relative w-12 h-12 rounded-lg overflow-hidden ring-1 ring-black/10 shrink-0"
                        style={{ background: it.photoPreview ? "#000" : "#e2e8f0" }}
                      >
                        {it.photoPreview ? (
                          <img src={it.photoPreview} alt={it.type} className="w-full h-full object-cover" />
                        ) : (
                          <span className="grid place-items-center w-full h-full text-2xl">{emojiFor(it.type)}</span>
                        )}
                        <span
                          className={`absolute inset-x-0 bottom-0 text-[9px] font-bold text-white text-center py-0.5 ${
                            it.photo ? "bg-teal-500/90" : "bg-brand-500/90"
                          }`}
                        >
                          {it.photo ? "✓ photo" : "📷 add"}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-ink text-sm">{it.type}</div>
                        <div className="text-[11px] text-slate-400 font-mono">tag ••••-{String(i + 1).padStart(2, "0")}</div>
                      </div>
                      <div className="flex items-center gap-1 bg-white rounded-lg ring-soft">
                        <button onClick={() => update(it.key, { qty: Math.max(1, it.qty - 1) })} className="w-8 h-8 text-ink-soft font-bold">
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold">{it.qty}</span>
                        <button onClick={() => update(it.key, { qty: it.qty + 1 })} className="w-8 h-8 text-ink-soft font-bold">
                          +
                        </button>
                      </div>
                      <button onClick={() => remove(it.key)} className="text-slate-300 hover:text-red-500 text-lg w-7" aria-label="Remove">
                        ×
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2.5 sm:pl-[60px]">
                      <select
                        value={it.serviceId}
                        onChange={(e) => update(it.key, { serviceId: e.target.value })}
                        className="text-xs font-semibold rounded-lg ring-soft bg-white px-2 py-1.5 text-ink-soft"
                      >
                        {activeServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} · {cedis(s.price)}/{s.unit}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 flex-wrap">
                        {COLORS.map((col) => (
                          <button
                            key={col.name}
                            onClick={() => update(it.key, { colorHex: col.hex, colorName: col.name })}
                            title={col.name}
                            className={`w-6 h-6 rounded-full ring-1 ring-black/10 transition ${
                              it.colorName === col.name ? "ring-2 ring-brand-500 scale-110" : ""
                            }`}
                            style={{ background: col.hex }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        {(["delicate", "stain", "vip"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => update(it.key, { flag: it.flag === f ? undefined : f })}
                            className={it.flag === f ? "" : "opacity-40 hover:opacity-100"}
                          >
                            <FlagPill flag={f} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:pl-[60px] mt-2">
                      <input
                        value={it.note ?? ""}
                        onChange={(e) => update(it.key, { note: e.target.value })}
                        placeholder="Note (e.g. oil stain on left cuff)"
                        className="w-full bg-white ring-soft rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="card rounded-2xl p-5 lg:sticky lg:top-6 animate-fade-up">
            {customer ? (
              <div className="flex items-center gap-3">
                <Avatar name={customer.name} size={44} />
                <div>
                  <div className="font-bold text-ink">{customer.name}</div>
                  <div className="text-xs text-ink-soft">{prettyPhone(customer.phone)}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-soft">Choose a customer to start.</div>
            )}

            <button
              onClick={() => setExpress((e) => !e)}
              className={`mt-4 w-full flex items-center justify-between rounded-xl px-4 py-3 transition ${
                express ? "bg-amber-100 ring-1 ring-amber-300" : "bg-slate-50 ring-soft"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">⚡ Express (same-day)</span>
              <span className={`w-10 h-6 rounded-full p-0.5 transition ${express ? "bg-amber-500" : "bg-slate-300"}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition ${express ? "translate-x-4" : ""}`} />
              </span>
            </button>

            <div className="mt-4 space-y-1.5 text-sm">
              <Row label={`Items (${totalItems})`} value={cedis(subtotal)} />
              {express && <Row label="Express +50%" value={cedis(total - subtotal)} accent="#d97706" />}
              <div className="border-t border-dashed my-2" />
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-ink">Total</span>
                <span className="font-display font-bold text-2xl text-gradient">{cedis(total)}</span>
              </div>
            </div>

            <button disabled={!customer || items.length === 0 || busy} onClick={submit} className={`${primaryBtn} mt-4 w-full py-3.5`}>
              {busy ? "Saving…" : "🎫 Create order & tags"}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              {items.length} tag{items.length === 1 ? "" : "s"} · payment can be taken now or at pickup
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold" style={{ color: accent ?? "#0e1424" }}>
        {value}
      </span>
    </div>
  );
}
