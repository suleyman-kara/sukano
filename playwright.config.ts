import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE, BASE_URL } from "./tests/e2e/ortam";

/**
 * Uçtan uca testler (PLAN §11): üç görünüm, Chromium.
 *
 * Sunucu: üretim derlemesi `vite preview` ile (Worker yerel workerd'de çalışır).
 * Geliştirme sunucusundaki bağımlılık ön derlemesi ilk yüklemede sayfayı yeniden
 * yükleyebildiği için önizleme daha kararlıdır. Sunucuyu `tests/e2e/global-setup.ts`
 * başlatır: önce ayrı yerel durumu (`.wrangler/e2e`) sıfırlayıp tohumlar, sonra
 * önizlemeyi açar (Playwright'ın `webServer`'ı global setup'tan önce başladığı için
 * kullanılmaz). Port 4173'te çalışan bir sunucu varsa yeniden kullanılır.
 *
 * Oturum: testler varsayılan olarak `ayse@test.sukano` oturumuyla koşar
 * (`tests/e2e/.auth/ayse.json`). Oturumsuz testler: `test.use({ storageState: OTURUMSUZ })`.
 *
 * Duman seti: `@duman` etiketli testler (`npm run e2e:duman`).
 */
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    storageState: AUTH_STATE,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "masaustu",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 834, height: 1194 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobil",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
