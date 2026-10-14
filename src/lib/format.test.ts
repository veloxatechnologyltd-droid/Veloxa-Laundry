import { describe, expect, it } from "vitest";
import { cedis, intervalHours, parseCedis, prettyPhone, slugify, toE164 } from "./format";

describe("money", () => {
  it("formats pesewas", () => {
    expect(cedis(3600)).toBe("₵36.00");
    expect(cedis(5)).toBe("₵0.05");
  });
  it("parses cedis input to pesewas", () => {
    expect(parseCedis("36")).toBe(3600);
    expect(parseCedis("36.5")).toBe(3650);
    expect(parseCedis("₵1,200.10")).toBe(120010);
    expect(parseCedis("0.29")).toBe(29); // no float drift
    expect(parseCedis("abc")).toBeNull();
    expect(parseCedis("1.234")).toBeNull();
    expect(parseCedis("")).toBeNull();
  });
});

describe("toE164", () => {
  it.each([
    ["0241184477", "+233241184477"],
    ["024 118 4477", "+233241184477"],
    ["241184477", "+233241184477"],
    ["+233 24 118 4477", "+233241184477"],
    ["+233 024 118 4477", "+233241184477"],
    ["00233241184477", "+233241184477"],
    ["233241184477", "+233241184477"],
    ["+44 7911 123456", "+447911123456"],
  ])("%s → %s", (input, out) => expect(toE164(input)).toBe(out));

  it.each(["", "024118", "02411844771", "+233 24 118", "hello"])("rejects %s", (input) => expect(toE164(input)).toBeNull());

  it("pretty prints Ghana numbers", () => expect(prettyPhone("+233241184477")).toBe("+233 24 118 4477"));
});

describe("misc", () => {
  it("slugifies", () => expect(slugify("Kappa 7 Laundry & Dry Cleaning!")).toBe("kappa-7-laundry-dry-cleaning"));
  it("reads postgres intervals", () => {
    expect(intervalHours("24:00:00")).toBe(24);
    expect(intervalHours("1 day")).toBe(24);
    expect(intervalHours("2 days 03:00:00")).toBe(51);
  });
});
