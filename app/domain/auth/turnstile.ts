/**
 * Cloudflare Turnstile test anahtarları
 * (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
 *
 * Test gizli anahtarlarının sonucu Cloudflare tarafından sabittir; sunucu bu
 * anahtarlarla siteverify'a gitmeden aynı sonucu üretir. Böylece yerel geliştirme,
 * Worker testleri ve CI dış ağa bağımlı olmaz. Gerçek anahtarlar her zaman
 * Cloudflare'e sorulur.
 */

/** Her zaman geçen site anahtarı (yerel ve önizleme varsayılanı). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
/** Her zaman geçen gizli anahtar. */
export const TURNSTILE_TEST_SECRET_PASS = "1x0000000000000000000000000000000AA";
/** Test site anahtarlarının ürettiği jeton. */
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const TEST_SECRET_OUTCOMES: Record<string, boolean> = {
  [TURNSTILE_TEST_SECRET_PASS]: true,
  "2x0000000000000000000000000000000AA": false, // her zaman başarısız
  "3x0000000000000000000000000000000AA": false, // "jeton zaten kullanılmış"
};

/** Test gizli anahtarıysa sabit sonuç, değilse `null` (Cloudflare'e sorulmalı). */
export function turnstileTestKeyOutcome(secret: string, _token: string): boolean | null {
  return secret in TEST_SECRET_OUTCOMES ? TEST_SECRET_OUTCOMES[secret]! : null;
}
