/**
 * Çevrimdışı okuma (PLAN §5) için sunucu ve service worker'ın ortak sözleşmesi.
 * Service worker (`public/sw.js`) düz JavaScript olduğu için adlar orada da aynen yazılıdır;
 * `tests/unit/pwa/service-worker.test.ts` ikisinin eşleştiğini denetler.
 */

/** Belge ve `.data` yanıtlarındaki oturum işareti başlığı. */
export const OFFLINE_SESSION_HEADER = "X-Sukano-Oturum";

/** Oturum yok: service worker kullanıcı önbelleklerini siler. */
export const NO_SESSION = "yok";

/** Kullanıcı sayfa önbelleklerinin ad öneki (`sukano-sayfa-<anahtar>`). */
export const PAGE_CACHE_PREFIX = "sukano-sayfa-";

/**
 * Oturum kimliğinden türetilen önbellek anahtarı: SHA-256'nın ilk 16 onaltılık hanesi.
 * Oturum jetonu değil kimliği kullanılır ve özetlenir; anahtar çereze çevrilemez.
 */
export async function sessionCacheKey(sessionId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sukano-sw:${sessionId}`),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
