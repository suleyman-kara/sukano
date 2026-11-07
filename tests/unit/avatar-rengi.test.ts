import { describe, expect, it } from "vitest";
import { avatarColorFor } from "~/lib/avatar";

describe("avatar rengi", () => {
  it("rengi olmayan kullanıcıya kimliğinden kararlı bir palet rengi verilir", () => {
    const a = avatarColorFor("user-ayse");
    expect(a).toMatch(/^#[0-9A-F]{6}$/);
    expect(avatarColorFor("user-ayse")).toBe(a);
    const all = new Set(Array.from({ length: 40 }, (_, i) => avatarColorFor(`u${i}`)));
    expect(all.size).toBeGreaterThan(1);
  });
});
