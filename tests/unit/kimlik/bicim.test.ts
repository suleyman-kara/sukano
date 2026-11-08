import { describe, expect, it } from "vitest";
import { relativeAgo, sessionSummary } from "~/domain/auth/format";

const now = new Date("2026-11-07T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 86_400_000;

describe("göreli zaman", () => {
  it("bir dakikadan kısa süreye 'az önce' der", () => {
    expect(relativeAgo(ago(30_000), now)).toBe("az önce");
  });

  it("dakika, saat, gün, ay ve yıl birimlerini kullanır", () => {
    expect(relativeAgo(ago(5 * 60_000), now)).toBe("5 dakika önce");
    expect(relativeAgo(ago(3 * 3_600_000), now)).toBe("3 saat önce");
    expect(relativeAgo(ago(1 * DAY), now)).toBe("dün");
    expect(relativeAgo(ago(12 * DAY), now)).toBe("12 gün önce");
    expect(relativeAgo(ago(95 * DAY), now)).toBe("3 ay önce");
    expect(relativeAgo(ago(800 * DAY), now)).toBe("2 yıl önce");
  });

  it("gelecekteki tarihleri 'az önce' sayar (saat kayması)", () => {
    expect(relativeAgo(new Date(now.getTime() + 5000), now)).toBe("az önce");
  });
});

describe("oturum özeti", () => {
  it("diğer cihaz sayısını yazar", () => {
    expect(sessionSummary(1)).toBe("Yalnızca bu cihaz · oturumlar 30 gün açık kalır");
    expect(sessionSummary(3)).toBe("Bu cihaz ve 2 cihaz daha · oturumlar 30 gün açık kalır");
    expect(sessionSummary(0)).toBe("Yalnızca bu cihaz · oturumlar 30 gün açık kalır");
  });
});
