import { describe, expect, it, vi } from "vitest";
import { itemTag, remaining, takeCode } from "./codes";

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("order codes", () => {
  it("reserves a block once and mints sequential codes from it", async () => {
    const s = memStorage();
    const reserve = vi.fn().mockResolvedValue({ prefix: "VX", first_number: 1001, last_number: 1003 });
    expect(await takeCode("org", reserve, s)).toBe("VX-1001");
    expect(await takeCode("org", reserve, s)).toBe("VX-1002");
    expect(remaining("org", s)).toBe(1);
    expect(await takeCode("org", reserve, s)).toBe("VX-1003");
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("reserves a new block when exhausted", async () => {
    const s = memStorage();
    const reserve = vi
      .fn()
      .mockResolvedValueOnce({ prefix: "VX", first_number: 1001, last_number: 1001 })
      .mockResolvedValueOnce({ prefix: "VX", first_number: 1041, last_number: 1060 });
    await takeCode("org", reserve, s);
    expect(await takeCode("org", reserve, s)).toBe("VX-1041");
  });

  it("keeps blocks per org", async () => {
    const s = memStorage();
    await takeCode("a", vi.fn().mockResolvedValue({ prefix: "AA", first_number: 1, last_number: 5 }), s);
    expect(await takeCode("b", vi.fn().mockResolvedValue({ prefix: "BB", first_number: 1, last_number: 5 }), s)).toBe("BB-1");
  });

  it("makes item tags", () => {
    expect(itemTag("VX-1042", 0)).toBe("VX-1042-01");
    expect(itemTag("VX-1042", 11)).toBe("VX-1042-12");
  });
});
