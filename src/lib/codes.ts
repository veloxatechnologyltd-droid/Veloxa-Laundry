// Order codes (VX-1042) come from a block reserved per device with
// reserve_order_codes(org, n), so intake can keep minting unique codes offline.
// See docs/OFFLINE.md.

export interface CodeBlock {
  prefix: string;
  next: number;
  last: number;
}

export type Reserve = (n: number) => Promise<{ prefix: string; first_number: number; last_number: number }>;

const BLOCK_SIZE = 20;
const key = (orgId: string) => `veloxa_codes_${orgId}`;

export function loadBlock(orgId: string, storage: Pick<Storage, "getItem"> = localStorage): CodeBlock | null {
  try {
    const raw = storage.getItem(key(orgId));
    return raw ? (JSON.parse(raw) as CodeBlock) : null;
  } catch {
    return null;
  }
}

export function saveBlock(orgId: string, b: CodeBlock, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(key(orgId), JSON.stringify(b));
}

export const formatCode = (prefix: string, n: number) => `${prefix}-${n}`;
export const itemTag = (code: string, i: number) => `${code}-${String(i + 1).padStart(2, "0")}`;

/** Codes left in this device's block. Intake tops up while online when this runs low. */
export function remaining(orgId: string, storage: Pick<Storage, "getItem"> = localStorage): number {
  const b = loadBlock(orgId, storage);
  return b ? b.last - b.next + 1 : 0;
}

/**
 * Take the next code. The block is advanced and saved *before* the code is
 * returned, so a crash can only skip a number (gaps are fine), never reuse one.
 */
export async function takeCode(
  orgId: string,
  reserve: Reserve,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage
): Promise<string> {
  let b = loadBlock(orgId, storage);
  if (!b || b.next > b.last) {
    const r = await reserve(BLOCK_SIZE);
    b = { prefix: r.prefix, next: r.first_number, last: r.last_number };
  }
  const code = formatCode(b.prefix, b.next);
  saveBlock(orgId, { ...b, next: b.next + 1 }, storage);
  return code;
}
