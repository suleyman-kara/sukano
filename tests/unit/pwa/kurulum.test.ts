import { describe, expect, it } from "vitest";
import { DISMISS_DAYS, installHintFor, isIosSafari, parseDismissedAt } from "~/domain/pwa/install";
import { sessionCacheKey } from "~/domain/pwa/offline";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

const base = {
  userAgent: ANDROID,
  standalone: false,
  promptAvailable: false,
  dismissedAt: null,
  now: Date.UTC(2026, 10, 8),
};

describe("iOS Safari algılama", () => {
  it("iPhone Safari iOS sayılır; iOS Chrome sayılmaz", () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID)).toBe(false);
  });

  it("masaüstü kimlikli iPad dokunmatik noktadan anlaşılır; Mac Safari iPad değildir", () => {
    expect(isIosSafari(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 0)).toBe(false);
  });
});

describe("kurulum ipucu kararı", () => {
  it("tarayıcı kurulumu önerdiyse Ekle ipucu gösterilir", () => {
    expect(installHintFor({ ...base, promptAvailable: true })).toBe("prompt");
  });

  it("öneri yoksa Android'de ipucu yok; iPhone Safari'de adımlar gösterilir", () => {
    expect(installHintFor(base)).toBeNull();
    expect(installHintFor({ ...base, userAgent: IPHONE })).toBe("ios");
  });

  it("uygulama kurulu açıldıysa hiçbir ipucu gösterilmez", () => {
    expect(installHintFor({ ...base, promptAvailable: true, standalone: true })).toBeNull();
    expect(installHintFor({ ...base, userAgent: IPHONE, standalone: true })).toBeNull();
  });

  it(`"Şimdi değil"den sonra ${DISMISS_DAYS} gün gösterilmez, sonra yeniden gösterilir`, () => {
    const day = 86_400_000;
    const ctx = { ...base, promptAvailable: true };
    expect(installHintFor({ ...ctx, dismissedAt: base.now - 2 * day })).toBeNull();
    expect(installHintFor({ ...ctx, dismissedAt: base.now - DISMISS_DAYS * day })).toBe("prompt");
  });

  it("geçersiz kapatma kaydı yok sayılır", () => {
    expect(parseDismissedAt(null)).toBeNull();
    expect(parseDismissedAt("abc")).toBeNull();
    expect(parseDismissedAt("-5")).toBeNull();
    expect(parseDismissedAt("1700000000000")).toBe(1_700_000_000_000);
  });
});

describe("çevrimdışı oturum anahtarı", () => {
  it("aynı oturum aynı, farklı oturum farklı 16 haneli anahtar verir; kimliği içermez", async () => {
    const a = await sessionCacheKey("oturum-1");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await sessionCacheKey("oturum-1")).toBe(a);
    expect(await sessionCacheKey("oturum-2")).not.toBe(a);
    expect(a).not.toContain("oturum");
  });
});
