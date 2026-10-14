import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useStore } from "../store";
import { supabase, friendlyError } from "../lib/supabase";
import { cedis, intervalHours, parseCedis, toE164, prettyPhone } from "../lib/format";
import type { Role, Service } from "../lib/types";
import { inputCls, labelCls, primaryBtn } from "../ui";

export default function Settings() {
  const { role } = useStore();
  return (
    <div className="space-y-5 max-w-3xl">
      <header className="animate-fade-up">
        <div className="text-sm font-semibold text-teal-500">Your laundry</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Settings</h1>
      </header>
      {role === "owner" && <ShopSettings />}
      <PriceList editable={role !== "staff"} />
      <Team />
    </div>
  );
}

function ShopSettings() {
  const { org, toast } = useStore();
  const { reloadMemberships } = useAuth();
  const [name, setName] = useState(org.name);
  const [phone, setPhone] = useState(org.phone ? prettyPhone(org.phone) : "");
  const [prefix, setPrefix] = useState(org.code_prefix);
  const [sender, setSender] = useState(org.sms_sender_id ?? "");
  const [remindHours, setRemindHours] = useState(String(intervalHours(org.reminder_after)));
  const [remindMax, setRemindMax] = useState(String(org.reminder_max));
  const [busy, setBusy] = useState(false);

  const phoneE164 = phone.trim() ? toE164(phone) : null;
  const valid =
    name.trim().length >= 2 &&
    (!phone.trim() || !!phoneE164) &&
    /^[A-Z]{1,4}$/.test(prefix) &&
    /^[A-Za-z0-9 ]{0,11}$/.test(sender) &&
    Number(remindHours) >= 1 &&
    Number(remindMax) >= 0 &&
    Number(remindMax) <= 10;

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        phone: phoneE164,
        code_prefix: prefix,
        sms_sender_id: sender.trim() || null,
        reminder_after: `${Number(remindHours)} hours`,
        reminder_max: Number(remindMax),
      })
      .eq("id", org.id);
    setBusy(false);
    if (error) return toast({ title: "Couldn't save", body: friendlyError(error), emoji: "⚠️", tone: "error" });
    // A new prefix applies from the next reserved block; drop this device's old block.
    if (prefix !== org.code_prefix) localStorage.removeItem(`veloxa_codes_${org.id}`);
    toast({ title: "Settings saved", body: name, emoji: "✅", tone: "success" });
    reloadMemberships();
  };

  return (
    <section className="card rounded-2xl p-5 animate-fade-up">
      <h2 className="font-display font-bold text-ink">Shop details</h2>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <Field label="Laundry name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Shop phone" hint={phone.trim() && !phoneE164 ? "Not a valid number" : undefined}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} inputMode="tel" placeholder="030 000 0000" />
        </Field>
        <Field label="Order code prefix" hint={`Next orders look like ${prefix || "VX"}-1234`}>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="SMS sender ID" hint="Max 11 letters/digits. Must be registered with the SMS provider.">
          <input value={sender} onChange={(e) => setSender(e.target.value.slice(0, 11))} className={inputCls} placeholder="e.g. KAPPA7" />
        </Field>
        <Field label="Pickup reminder after (hours)">
          <input value={remindHours} onChange={(e) => setRemindHours(e.target.value.replace(/\D/g, ""))} className={inputCls} inputMode="numeric" />
        </Field>
        <Field label="Max automatic reminders">
          <input value={remindMax} onChange={(e) => setRemindMax(e.target.value.replace(/\D/g, ""))} className={inputCls} inputMode="numeric" />
        </Field>
      </div>
      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <div className="text-[11px] text-slate-400">
          Plan: <span className="font-semibold capitalize">{org.plan}</span> · paid until {new Date(org.paid_until).toLocaleDateString("en-GB")}
        </div>
        <button onClick={save} disabled={!valid || busy} className={primaryBtn}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

function PriceList({ editable }: { editable: boolean }) {
  const { services, org, refresh, toast } = useStore();
  const [rows, setRows] = useState<(Service & { priceText: string; dirty?: boolean })[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(services.map((s) => ({ ...s, priceText: (s.price / 100).toFixed(2) })));
  }, [services]);

  const patch = (id: string, p: Partial<(typeof rows)[number]>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p, dirty: true } : r)));

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        org_id: org.id,
        label: "",
        unit: "item",
        price: 0,
        priceText: "",
        active: true,
        sort: prev.length + 1,
        dirty: true,
      },
    ]);

  const valid = rows.every((r) => !r.dirty || (r.label.trim() && parseCedis(r.priceText) !== null));

  const save = async () => {
    setBusy(true);
    const changed = rows
      .filter((r) => r.dirty)
      .map((r) => ({
        id: r.id,
        org_id: org.id,
        label: r.label.trim(),
        unit: r.unit.trim() || "item",
        price: parseCedis(r.priceText)!,
        active: r.active,
        sort: r.sort,
      }));
    const { error } = await supabase.from("services").upsert(changed);
    setBusy(false);
    if (error) return toast({ title: "Couldn't save prices", body: friendlyError(error), emoji: "⚠️", tone: "error" });
    toast({ title: "Price list saved", body: `${changed.length} service${changed.length === 1 ? "" : "s"} updated`, emoji: "🏷️", tone: "success" });
    refresh();
  };

  return (
    <section className="card rounded-2xl p-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-ink">Price list</h2>
        {editable && (
          <button onClick={addRow} className="text-xs font-bold text-brand-600 hover:bg-brand-50 rounded-lg px-2 py-1">
            ＋ Add service
          </button>
        )}
      </div>
      <p className="text-xs text-ink-soft mt-1">Changing a price only affects new orders; existing orders keep the price they were taken at.</p>
      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className={`flex items-center gap-2 rounded-xl bg-slate-50 ring-soft p-2 ${r.active ? "" : "opacity-50"}`}>
            {editable ? (
              <>
                <input
                  value={r.label}
                  onChange={(e) => patch(r.id, { label: e.target.value })}
                  placeholder="Service name"
                  className="flex-1 min-w-0 bg-white ring-soft rounded-lg px-2.5 py-2 text-sm"
                />
                <span className="text-sm text-ink-soft">₵</span>
                <input
                  value={r.priceText}
                  onChange={(e) => patch(r.id, { priceText: e.target.value })}
                  inputMode="decimal"
                  className="w-20 bg-white ring-soft rounded-lg px-2.5 py-2 text-sm text-right"
                />
                <span className="text-xs text-ink-soft">/</span>
                <input
                  value={r.unit}
                  onChange={(e) => patch(r.id, { unit: e.target.value })}
                  className="w-16 bg-white ring-soft rounded-lg px-2 py-2 text-xs"
                />
                <label className="flex items-center gap-1 text-[11px] text-ink-soft" title="Inactive services are hidden at intake">
                  <input type="checkbox" checked={r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} />
                  on
                </label>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-semibold text-ink">{r.label}</span>
                <span className="text-sm text-ink-soft">
                  {cedis(r.price)} / {r.unit}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={busy || !valid || !rows.some((r) => r.dirty)} className={primaryBtn}>
            {busy ? "Saving…" : "Save prices"}
          </button>
        </div>
      )}
    </section>
  );
}

function Team() {
  const { org } = useStore();
  const [team, setTeam] = useState<{ user_id: string; display_name: string; role: Role }[]>([]);
  useEffect(() => {
    supabase
      .from("memberships")
      .select("user_id, display_name, role")
      .eq("org_id", org.id)
      .order("created_at")
      .then(({ data }) => setTeam((data as typeof team) ?? []));
  }, [org.id]);

  return (
    <section className="card rounded-2xl p-5 animate-fade-up">
      <h2 className="font-display font-bold text-ink">Team</h2>
      <div className="mt-3 space-y-1">
        {team.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between text-sm py-1.5">
            <span className="font-semibold text-ink">{m.display_name}</span>
            <span className="text-xs capitalize text-ink-soft bg-slate-100 rounded-full px-2 py-0.5">{m.role}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-3">Inviting staff is coming soon.</p>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
