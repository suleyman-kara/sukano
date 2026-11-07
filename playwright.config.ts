import { defineConfig, devices } from "@playwright/test";

/**
 * Uçtan uca testler (PLAN §11): üç görünüm, Chromium.
 *
 * Sunucu: üretim derlemesi `vite preview` ile (Worker yerel workerd'de çalışır).
 * Geliştirme sunucusundaki bağımlılık ön derlemesi ilk yüklemede sayfayı yeniden
 * yükleyebildiği için önizleme daha kararlıdır.
 *
 * Duman seti: `@duman` etiketli testler (`npm run e2e:duman`).
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
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
    baseURL,
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
  // E2E_BASE_URL verilirse (ör. önizleme dağıtımı) yerel sunucu başlatılmaz.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: `${baseURL}/health`,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
