/** Uçtan uca testlerin ortak ayarları (playwright.config.ts ve global-setup.ts). */

export const PORT = Number(process.env.E2E_PORT ?? 4173);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** Uçtan uca testlerin yerel D1/R2/DO durumu (geliştirme verisinden ayrı). */
export const PERSIST_DIR = ".wrangler/e2e";

/** `ayse@test.sukano` oturumu; testler varsayılan olarak bununla koşar. */
export const AUTH_STATE = process.env.E2E_OTURUM_AYSE ?? "tests/e2e/.auth/ayse.json";

/** Oturumsuz testler için: `test.use({ storageState: OTURUMSUZ })`. */
export const OTURUMSUZ = { cookies: [], origins: [] };
