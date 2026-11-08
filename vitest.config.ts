import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Birim + bileşen testleri (jsdom). Worker / API testleri ayrı yapılandırmada:
 * vitest.workers.config.ts. Uçtan uca testler: playwright.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  test: {
    name: "birim",
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Eşik yalnızca saf mantık modüllerinde (PLAN §11). Kimlik doğrulama,
      // oturum ve e-posta modülleri G/Ç ağırlıklıdır; Worker havuzunda test edilir.
      include: ["app/lib/**/*.{ts,tsx}", "app/domain/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "app/lib/auth*",
        "app/lib/auth/**",
        "app/lib/session*",
        "app/lib/email*",
        "app/lib/**/*.server.{ts,tsx}",
      ],
      thresholds: {
        statements: 85,
        branches: 85,
      },
    },
  },
});
