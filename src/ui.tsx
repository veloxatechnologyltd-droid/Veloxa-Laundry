import { useEffect, useState } from "react";
import { STAGES, stageMeta, type Stage, type Flag } from "./lib/types";
import { initials, tintFor } from "./lib/format";
import { supabase, PHOTO_BUCKET } from "./lib/supabase";

// Deterministic pseudo-random from a string (so tags render stable QR-ish art)
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Decorative QR-style art from the item tag. TODO(Phase 4): real scannable QR for printing. */
export function QRTag({ value, size = 88 }: { value: string; size?: number }) {
  const cells = 11;
  const grid: boolean[] = [];
  for (let i = 0; i < cells * cells; i++) {
    grid[i] = ((hash(value + i) >>> (i % 7)) & 1) === 1;
  }
  const cell = size / cells;
  const finder = (x: number, y: number) => (
    <g key={`f-${x}-${y}`}>
      <rect x={x * cell} y={y * cell} width={cell * 3} height={cell * 3} rx={cell * 0.6} fill="#0e1424" />
      <rect x={(x + 0.75) * cell} y={(y + 0.75) * cell} width={cell * 1.5} height={cell * 1.5} rx={cell * 0.3} fill="#fff" />
    </g>
  );
  const isFinder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c >= cells - 3) || (r >= cells - 3 && c < 3);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} rx={size * 0.1} fill="#fff" />
      {grid.map((on, i) => {
        const r = Math.floor(i / cells);
        const c = i % cells;
        if (isFinder(r, c) || !on) return null;
        return (
          <rect
            key={i}
            x={c * cell + cell * 0.12}
            y={r * cell + cell * 0.12}
            width={cell * 0.76}
            height={cell * 0.76}
            rx={cell * 0.2}
            fill="#1f47f5"
            opacity={0.88}
          />
        );
      })}
      {finder(0, 0)}
      {finder(cells - 3, 0)}
      {finder(0, cells - 3)}
    </svg>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const tint = tintFor(name);
  return (
    <div
      className="grid place-items-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${tint}, ${tint}cc)`,
        boxShadow: `0 4px 14px -4px ${tint}99`,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function StageBadge({ stage, sm }: { stage: Stage; sm?: boolean }) {
  const m = stageMeta(stage);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        sm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ background: `${m.color}18`, color: m.color }}
    >
      <span className="grid place-items-center">{m.emoji}</span>
      {m.label}
    </span>
  );
}

export function FlagPill({ flag }: { flag: Flag }) {
  const map = {
    vip: { t: "High value", c: "#b45309", bg: "#fef3c7", e: "⭐" },
    delicate: { t: "Delicate", c: "#7c3aed", bg: "#f3e8ff", e: "🫧" },
    stain: { t: "Stain flagged", c: "#dc2626", bg: "#fee2e2", e: "⚠️" },
  }[flag];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: map.c, background: map.bg }}
    >
      {map.e} {map.t}
    </span>
  );
}

/** Horizontal progress stepper for an order. */
export function StageTrack({ current }: { current: Stage }) {
  const curIdx = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center">
      {STAGES.map((s, i) => {
        const done = i < curIdx;
        const active = i === curIdx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`grid place-items-center rounded-full text-sm transition-all ${
                  active ? "pulse-ring" : ""
                }`}
                style={{
                  width: 34,
                  height: 34,
                  background: done || active ? s.color : "#e6eaf2",
                  color: done || active ? "#fff" : "#94a3b8",
                  transform: active ? "scale(1.12)" : "scale(1)",
                }}
              >
                {done ? "✓" : s.emoji}
              </div>
              <span
                className="text-[10px] font-semibold text-center leading-tight w-14"
                style={{ color: done || active ? s.color : "#94a3b8" }}
              >
                {s.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex-1 h-1 rounded-full mx-1 -mt-4" style={{ background: "#e6eaf2" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: done ? "100%" : "0%", background: s.color }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Swatch({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span
        className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-black/10"
        style={{ background: color }}
      />
      {name}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  emoji,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  emoji: string;
  accent: string;
}) {
  return (
    <div className="card rounded-2xl p-4 animate-fade-up">
      <div className="flex items-start justify-between">
        <div
          className="grid place-items-center rounded-xl text-lg"
          style={{ width: 40, height: 40, background: `${accent}18` }}
        >
          {emoji}
        </div>
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-ink">{value}</div>
      <div className="text-sm font-medium text-ink-soft">{label}</div>
      {sub && <div className="text-xs mt-1" style={{ color: accent }}>{sub}</div>}
    </div>
  );
}

// Signed URLs for private item photos, cached for the session.
const urlCache = new Map<string, string>();

export function usePhotoUrl(path: string | null | undefined): string | undefined {
  const [url, setUrl] = useState(() => (path ? urlCache.get(path) : undefined));
  useEffect(() => {
    if (!path) return setUrl(undefined);
    const hit = urlCache.get(path);
    if (hit) return setUrl(hit);
    let alive = true;
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        urlCache.set(path, data.signedUrl);
        if (alive) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export function ItemThumb({
  path,
  emoji,
  colorHex,
  size = 48,
  alt,
}: {
  path?: string | null;
  emoji: string;
  colorHex?: string | null;
  size?: number;
  alt: string;
}) {
  const url = usePhotoUrl(path);
  if (url)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        <img
          src={url}
          alt={alt}
          className="rounded-lg object-cover ring-1 ring-black/10"
          style={{ width: size, height: size }}
        />
      </a>
    );
  return (
    <span
      className="rounded-lg grid place-items-center ring-1 ring-black/5 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `${colorHex ?? "#94a3b8"}22` }}
    >
      {emoji}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center py-16 text-ink-soft">
      <div className="text-4xl animate-drift">🧺</div>
      {label && <div className="text-sm mt-2">{label}</div>}
    </div>
  );
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-up overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} card rounded-3xl p-6 animate-pop my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export const inputCls =
  "mt-1 w-full bg-slate-50 ring-soft rounded-xl px-3.5 py-3 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500";
export const labelCls = "text-xs font-bold text-slate-400 uppercase tracking-wide";
export const primaryBtn =
  "bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 px-5 shadow-lg shadow-brand-500/30 transition";
export const secondaryBtn = "bg-white ring-soft text-ink-soft font-semibold rounded-xl py-3 px-5 hover:bg-slate-50 transition";
