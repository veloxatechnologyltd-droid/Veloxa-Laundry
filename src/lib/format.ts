// Display + input helpers. Money is integer pesewas everywhere except here.

/** 3600 → "₵36.00" */
export const cedis = (pesewas: number) => `₵${(pesewas / 100).toFixed(2)}`;

/** "36", "36.5", "₵36.50" → 3650. Returns null for anything that isn't a valid amount. */
export function parseCedis(input: string): number | null {
  const s = input.replace(/[₵,\s]/g, "").replace(/^GHS/i, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/**
 * Normalise a Ghana phone number to E.164 (+233XXXXXXXXX).
 * Accepts "024 118 4477", "0241184477", "241184477", "+233 24 118 4477", "00233…".
 * Other international numbers starting with "+" are kept if they look valid.
 * Returns null if it can't be made valid.
 */
export function toE164(input: string): string | null {
  const raw = input.trim();
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) {
    const digits = d.slice(1).replace(/\D/g, "");
    if (digits.startsWith("233")) {
      let rest = digits.slice(3);
      if (rest.startsWith("0")) rest = rest.slice(1); // "+233 024…" typo
      return /^\d{9}$/.test(rest) ? `+233${rest}` : null;
    }
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }
  if (/^0\d{9}$/.test(d)) return `+233${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `+233${d}`;
  if (/^233\d{9}$/.test(d)) return `+${d}`;
  return null;
}

/** "+233241184477" → "+233 24 118 4477" */
export function prettyPhone(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+233 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

const TINTS = ["#1f47f5", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0891b2", "#db2777", "#65a30d"];

/** Stable avatar colour for a name/id. */
export function tintFor(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return TINTS[(h >>> 0) % TINTS.length];
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (now - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

export function clockUntil(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - now) / 60000;
  if (diff <= 0) return "overdue";
  if (diff < 60) return `in ${Math.round(diff)}m`;
  if (diff < 1440) return `in ${Math.round(diff / 60)}h`;
  return `in ${Math.round(diff / 1440)}d`;
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "Kappa 7 Laundry!" → "kappa-7-laundry" */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Postgres interval text ("24:00:00", "1 day", "2 days 03:00:00") → hours. */
export function intervalHours(iv: string): number {
  let h = 0;
  const days = /(\d+)\s+days?/.exec(iv);
  if (days) h += Number(days[1]) * 24;
  const hms = /(\d+):(\d+):(\d+)/.exec(iv);
  if (hms) h += Number(hms[1]) + Number(hms[2]) / 60;
  return h;
}
