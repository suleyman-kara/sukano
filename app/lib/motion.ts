/**
 * Hareket sistemi (PLAN §10, docs/design/MotionSpec.dc.html, MicroMotion.dc.html).
 *
 * - Süreler ve eğriler `app/app.css`'teki `--dur-*` / `--ease-*` belirteçleriyle aynıdır;
 *   Motion (`motion/react`) geçişleri buradaki sayıları kullanır.
 * - "Hareketi azalt" tercihi: `system` (işletim sistemine uy), `reduced` (Açık: her zaman
 *   azalt), `full` (Kapalı: sistem azaltsa da tam hareket). Kullanıcı başına
 *   `user_preferences.motion`'da tutulur; oturumsuz sayfalar (giriş ekranı) için aynı değer
 *   çerezde de saklanır. Sunucu `<html data-motion="reduced|full">` yazar, ilk boyamada
 *   titreme olmaz.
 * - Azaltılmış harekette kayma, ölçek, ortam döngüleri ve ışıltı kapanır; anlam taşıyan
 *   durum değişimi anında olur (`motionTransition` süresiz döner).
 */

export const MOTION_PREFERENCES = ["system", "reduced", "full"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** Oturumsuz sayfaların (giriş, kayıt) tercihi okuduğu çerez. */
export const MOTION_COOKIE = "sukano_hareket";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Süre ölçeği, saniye (MotionSpec: micro 120, small 180, medium 240, large 320 ms). */
export const DURATION = { micro: 0.12, small: 0.18, medium: 0.24, large: 0.32 } as const;
export type MotionSize = keyof typeof DURATION;

/** Eğriler (cubic-bezier): giriş ease-out-quart, çıkış ease-in-quart, yaylı, yer değiştirme. */
export const EASE = {
  out: [0.25, 1, 0.5, 1],
  in: [0.5, 0, 0.75, 0],
  spring: [0.2, 0.8, 0.2, 1],
  inout: [0.65, 0, 0.35, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type MotionEase = keyof typeof EASE;

/** Motion'ın `Transition` biçimiyle uyumlu, bağımlılıksız geçiş tanımı. */
export type MotionTransition = {
  duration: number;
  ease?: readonly [number, number, number, number];
  delay?: number;
};

/** Hareket yok: anında. */
export const INSTANT: MotionTransition = { duration: 0 };

export function isMotionPreference(value: unknown): value is MotionPreference {
  return typeof value === "string" && (MOTION_PREFERENCES as readonly string[]).includes(value);
}

/** Bilinmeyen değer → `system`. */
export function toMotionPreference(value: unknown): MotionPreference {
  return isMotionPreference(value) ? value : "system";
}

/** `<html data-motion>` değeri; `system`'de öznitelik yazılmaz. */
export function motionAttribute(pref: MotionPreference): "reduced" | "full" | undefined {
  return pref === "system" ? undefined : pref;
}

/** Tercih ve sistem ayarından azaltılmış hareketin geçerli olup olmadığı. */
export function isReducedMotion(pref: MotionPreference, systemReduced: boolean): boolean {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return systemReduced;
}

/**
 * Giriş geçişi: ölçekteki süre ve eğri (giriş varsayılanı ease-out). Azaltılmış harekette
 * anında.
 */
export function motionTransition(
  size: MotionSize,
  reduced: boolean,
  ease: MotionEase = "out",
  delay = 0,
): MotionTransition {
  if (reduced) return INSTANT;
  return delay
    ? { duration: DURATION[size], ease: EASE[ease], delay }
    : { duration: DURATION[size], ease: EASE[ease] };
}

/** Çıkış geçişi: girişin bir basamak kısası (240 → 180, 180 → 120), ease-in. */
export function exitTransition(size: MotionSize, reduced: boolean): MotionTransition {
  if (reduced) return INSTANT;
  const shorter: Record<MotionSize, MotionSize> = {
    micro: "micro",
    small: "micro",
    medium: "small",
    large: "medium",
  };
  return { duration: DURATION[shorter[size]], ease: EASE.in };
}

/** CSS `cubic-bezier(...)` metni (Web Animations API için). */
export function cssEase(ease: MotionEase): string {
  return `cubic-bezier(${EASE[ease].join(", ")})`;
}

/* ------------------------------------------------------------------ */
/* Çerez                                                               */
/* ------------------------------------------------------------------ */

/** `Cookie` başlığından tercihi okur; yoksa `system`. */
export function parseMotionCookie(header: string | null | undefined): MotionPreference {
  if (!header) return "system";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === MOTION_COOKIE) return toMotionPreference(decodeURIComponent(rest.join("=")));
  }
  return "system";
}

/** `Set-Cookie` değeri (1 yıl; `system` çerezi siler). */
export function motionCookie(pref: MotionPreference, secure = false): string {
  const base = `${MOTION_COOKIE}=${pref}; Path=/; SameSite=Lax`;
  const tail = secure ? "; Secure" : "";
  return pref === "system" ? `${base}; Max-Age=0${tail}` : `${base}; Max-Age=31536000${tail}`;
}

/* ------------------------------------------------------------------ */
/* Tarayıcı                                                            */
/* ------------------------------------------------------------------ */

/** Tercihi hemen uygular: `<html data-motion>` ve oturumsuz sayfalar için çerez. */
export function applyMotionPreference(pref: MotionPreference) {
  const root = document.documentElement;
  const attr = motionAttribute(pref);
  if (attr) root.setAttribute("data-motion", attr);
  else root.removeAttribute("data-motion");
  try {
    document.cookie = motionCookie(pref, location.protocol === "https:");
  } catch {
    // Çerez kapalı olabilir; öznitelik yine uygulanır.
  }
}

/** `<html data-motion>`'dan geçerli tercih. */
export function currentMotionPreference(): MotionPreference {
  if (typeof document === "undefined") return "system";
  return toMotionPreference(document.documentElement.dataset.motion ?? "system");
}
