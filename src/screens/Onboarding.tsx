// First run after signup: create the laundry (org). create_organization makes
// the caller the owner and seeds a Main branch + default price list.
import { useState } from "react";
import { useAuth } from "../auth";
import { supabase, friendlyError } from "../lib/supabase";
import { slugify } from "../lib/format";
import { inputCls, labelCls, primaryBtn } from "../ui";
import { AuthCard } from "./Login";

export default function Onboarding() {
  const { reloadMemberships, setActiveOrg, signOut, session } = useAuth();
  const [shop, setShop] = useState("");
  const [owner, setOwner] = useState("");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = shop.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "VX";
  const finalPrefix = (prefix || suggested).toUpperCase();
  const prefixOk = /^[A-Z]{1,4}$/.test(finalPrefix);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefixOk) return;
    setBusy(true);
    setError(null);
    const slug = `${slugify(shop) || "laundry"}-${crypto.randomUUID().slice(0, 4)}`;
    const { data: orgId, error } = await supabase.rpc("create_organization", {
      org_name: shop.trim(),
      org_slug: slug,
      owner_name: owner.trim(),
    });
    if (error) {
      setError(friendlyError(error));
      setBusy(false);
      return;
    }
    if (finalPrefix !== "VX") {
      await supabase.from("organizations").update({ code_prefix: finalPrefix }).eq("id", orgId);
    }
    setActiveOrg(orgId as string);
    await reloadMemberships();
  };

  return (
    <AuthCard title="Set up your laundry" sub="This takes a minute. You can change everything later in Settings.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Laundry name</label>
          <input
            required
            autoFocus
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            className={inputCls}
            placeholder="e.g. Kappa 7 Laundry & Dry Cleaning"
          />
        </div>
        <div>
          <label className={labelCls}>Your name</label>
          <input
            required
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className={inputCls}
            placeholder="e.g. Adjoa Mensah"
          />
        </div>
        <div>
          <label className={labelCls}>Order code prefix</label>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
            className={`${inputCls} font-mono`}
            placeholder={suggested}
          />
          <div className="text-[11px] text-slate-400 mt-1">
            Orders will look like <span className="font-mono font-semibold text-brand-600">{finalPrefix}-1001</span>,
            tags like <span className="font-mono font-semibold text-brand-600">{finalPrefix}-1001-01</span>.
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
        <button type="submit" disabled={busy || !shop.trim() || !owner.trim() || !prefixOk} className={`${primaryBtn} w-full`}>
          {busy ? "Setting up…" : "Create my laundry"}
        </button>
      </form>
      <div className="text-xs text-slate-400 text-center mt-5">
        Signed in as {session?.user.email} ·{" "}
        <button onClick={signOut} className="font-semibold text-brand-600 hover:underline">
          Sign out
        </button>
      </div>
    </AuthCard>
  );
}
