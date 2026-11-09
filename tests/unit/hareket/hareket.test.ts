import { describe, expect, it } from "vitest";
import {
  applyMotionPreference,
  cssEase,
  currentMotionPreference,
  DURATION,
  EASE,
  exitTransition,
  INSTANT,
  REDUCED_FADE,
  TOAST_MS,
  isMotionPreference,
  isReducedMotion,
  motionAttribute,
  motionCookie,
  motionTransition,
  MOTION_COOKIE,
  parseMotionCookie,
  toMotionPreference,
} from "~/lib/motion";

/** Hareket sistemi yardımcıları (MotionSpec, PLAN §10). */

describe("süre ölçeği ve eğriler", () => {
  it("ölçek tasarımla aynıdır: 120 / 180 / 240 / 320 ms", () => {
    expect(DURATION).toEqual({ micro: 0.12, small: 0.18, medium: 0.24, large: 0.32 });
  });

  it("giriş ease-out-quart, çıkış ease-in-quart, yaylı ve yer değiştirme eğrileri", () => {
    expect(EASE.out).toEqual([0.25, 1, 0.5, 1]);
    expect(EASE.in).toEqual([0.5, 0, 0.75, 0]);
    expect(EASE.spring).toEqual([0.2, 0.8, 0.2, 1]);
    expect(EASE.inout).toEqual([0.65, 0, 0.35, 1]);
    expect(cssEase("spring")).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
  });
});

describe("geçiş yardımcıları", () => {
  it("giriş geçişi ölçekteki süreyi ve varsayılan ease-out'u kullanır", () => {
    expect(motionTransition("medium", false)).toEqual({ duration: 0.24, ease: EASE.out });
    expect(motionTransition("large", false, "spring")).toEqual({
      duration: 0.32,
      ease: EASE.spring,
    });
    expect(motionTransition("medium", false, "out", 0.06)).toEqual({
      duration: 0.24,
      ease: EASE.out,
      delay: 0.06,
    });
  });

  it("çıkış bir basamak kısadır ve ease-in'dir (240 → 180, 180 → 120)", () => {
    expect(exitTransition("medium", false)).toEqual({ duration: 0.18, ease: EASE.in });
    expect(exitTransition("small", false)).toEqual({ duration: 0.12, ease: EASE.in });
    expect(exitTransition("large", false)).toEqual({ duration: 0.24, ease: EASE.in });
    expect(exitTransition("micro", false)).toEqual({ duration: 0.12, ease: EASE.in });
  });

  it("azaltılmış harekette giriş ve çıkış 120 ms saydamlık olur, gecikme ve yay yok", () => {
    for (const size of ["micro", "small", "medium", "large"] as const) {
      expect(motionTransition(size, true)).toEqual(REDUCED_FADE);
      expect(motionTransition(size, true, "spring", 0.2)).toEqual({
        duration: 0.12,
        ease: EASE.out,
      });
      expect(exitTransition(size, true)).toEqual({ duration: 0.12, ease: EASE.in });
    }
    expect(INSTANT).toEqual({ duration: 0 });
  });

  it("toast süresi her yerde 6 sn", () => {
    expect(TOAST_MS).toBe(6000);
  });
});

describe("Hareketi azalt tercihi", () => {
  it("Sistem işletim sistemine uyar; Açık her zaman, Kapalı hiçbir zaman azaltır", () => {
    expect(isReducedMotion("system", true)).toBe(true);
    expect(isReducedMotion("system", false)).toBe(false);
    expect(isReducedMotion("reduced", false)).toBe(true);
    expect(isReducedMotion("full", true)).toBe(false);
  });

  it("bilinmeyen değer Sistem sayılır", () => {
    expect(isMotionPreference("reduced")).toBe(true);
    expect(isMotionPreference("acik")).toBe(false);
    expect(isMotionPreference(1)).toBe(false);
    expect(toMotionPreference("full")).toBe("full");
    expect(toMotionPreference(undefined)).toBe("system");
  });

  it("Sistem'de <html data-motion> yazılmaz", () => {
    expect(motionAttribute("system")).toBeUndefined();
    expect(motionAttribute("reduced")).toBe("reduced");
    expect(motionAttribute("full")).toBe("full");
  });
});

describe("çerez", () => {
  it("Cookie başlığından tercihi okur; yoksa ya da bozuksa Sistem", () => {
    expect(parseMotionCookie(null)).toBe("system");
    expect(parseMotionCookie("")).toBe("system");
    expect(parseMotionCookie("a=1; sukano_hareket=reduced; b=2")).toBe("reduced");
    expect(parseMotionCookie(`${MOTION_COOKIE}=full`)).toBe("full");
    expect(parseMotionCookie(`${MOTION_COOKIE}=hepsi`)).toBe("system");
    expect(parseMotionCookie("baska=reduced")).toBe("system");
  });

  it("Set-Cookie bir yıl geçerlidir; Sistem çerezi siler; https'te Secure", () => {
    expect(motionCookie("reduced")).toBe(
      "sukano_hareket=reduced; Path=/; SameSite=Lax; Max-Age=31536000",
    );
    expect(motionCookie("system")).toBe("sukano_hareket=system; Path=/; SameSite=Lax; Max-Age=0");
    expect(motionCookie("full", true)).toMatch(/; Secure$/);
  });
});

describe("tarayıcıda uygulama", () => {
  it("seçim <html data-motion>'a ve çereze hemen yazılır; Sistem özniteliği kaldırır", () => {
    applyMotionPreference("reduced");
    expect(document.documentElement.dataset.motion).toBe("reduced");
    expect(currentMotionPreference()).toBe("reduced");
    expect(document.cookie).toContain("sukano_hareket=reduced");
    applyMotionPreference("full");
    expect(currentMotionPreference()).toBe("full");
    applyMotionPreference("system");
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(currentMotionPreference()).toBe("system");
    expect(document.cookie).not.toContain("sukano_hareket");
  });
});
