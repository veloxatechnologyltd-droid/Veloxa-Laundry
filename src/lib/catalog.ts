// Garment quick-picks for intake. The DB stores only the `type` text; the
// emoji is derived from it for display.

export const CATALOG: { type: string; emoji: string; service: string }[] = [
  { type: "Dress Shirt", emoji: "👔", service: "Wash & Iron" },
  { type: "T-Shirt", emoji: "👕", service: "Wash & Fold" },
  { type: "Trousers", emoji: "👖", service: "Wash & Iron" },
  { type: "Blouse", emoji: "👚", service: "Wash & Iron" },
  { type: "Dress", emoji: "👗", service: "Dry Clean" },
  { type: "Suit / Kaftan", emoji: "🤵", service: "Dry Clean" },
  { type: "Kente / Cloth", emoji: "🧣", service: "Dry Clean" },
  { type: "Bedsheets", emoji: "🛏️", service: "Duvet / Bedding" },
  { type: "Towels", emoji: "🧻", service: "Wash & Fold" },
  { type: "Jeans", emoji: "👖", service: "Wash & Fold" },
];

const EXTRA: [RegExp, string][] = [
  [/shirt|polo/i, "👕"],
  [/trouser|jean|chino|pant/i, "👖"],
  [/dress|skirt|gown/i, "👗"],
  [/suit|kaftan|agbada|jacket|blazer/i, "🤵"],
  [/kente|cloth|scarf|smock/i, "🧣"],
  [/bed|duvet|sheet|pillow|curtain/i, "🛏️"],
  [/towel/i, "🧻"],
  [/short/i, "🩳"],
  [/jersey/i, "🎽"],
  [/overall/i, "🦺"],
];

export function emojiFor(type: string): string {
  const exact = CATALOG.find((c) => c.type === type);
  if (exact) return exact.emoji;
  return EXTRA.find(([re]) => re.test(type))?.[1] ?? "🧺";
}

export const COLORS = [
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#111827" },
  { name: "Navy", hex: "#1e3a8a" },
  { name: "Teal", hex: "#0e7490" },
  { name: "Red", hex: "#dc2626" },
  { name: "Gold", hex: "#b45309" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Green", hex: "#16a34a" },
  { name: "Grey", hex: "#64748b" },
  { name: "Assorted", hex: "conic-gradient(#dc2626,#f59e0b,#16a34a,#3366ff,#dc2626)" },
];

/** Express orders cost 50% more (same rule as the demo). */
export const EXPRESS_MULTIPLIER = 1.5;
export const READY_HOURS = { standard: 24, express: 4 };
