import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vitest/config";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

export default defineConfig(async () => {
  const migrations = existsSync(migrationsDir) ? await readD1Migrations(migrationsDir) : [];
  return {
    plugins: [
      reactRouter(),
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Ek testleri aynı kişiyle dakikada 30'dan çok dosya yükler: yükleme sınırı testte
          // geniş. Sınırın 429 yanıtı `guvenlik.test.ts`'te binding taklidiyle denetlenir.
          ratelimits: {
            UPLOAD_LIMITER: { namespace_id: "1003", simple: { limit: 10_000, period: 60 } },
          },
          // `.dev.vars` CI'da yoktur; kimlik testleri için sabit, gizli olmayan değerler.
          // Turnstile: Cloudflare'in her zaman geçen test anahtarı. Resend boş: e-postalar
          // `globalThis.__sukanoOutbox`'a düşer.
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: "workers-testleri-icin-en-az-32-karakterlik-gizli-deger",
            BETTER_AUTH_URL: "http://sukano.test",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
            RESEND_API_KEY: "",
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
            // Yalnızca testler için VAPID çifti (.dev.vars.example ile aynı); push isteği
            // testlerde sahte fetch'e gider.
            VAPID_PUBLIC_KEY:
              "BHzRFatmnMCE8yZma0Hqe2pnc5YSVYYkt117QNbqC2AL0xeaz7vHyTDr7XX_X05VCSQB8lE9ao3YhoiMc6WkIlg",
            VAPID_PRIVATE_KEY: "sus2EkCSy8NOF2bejjs49IAU4O5UVQiWmsKT3Zcs-Kc",
          },
        },
      }),
    ],
    resolve: {
      alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
    },
    test: {
      name: "workers",
      testTimeout: 60_000,
      hookTimeout: 60_000,
      include: ["tests/workers/**/*.test.ts"],
      setupFiles: ["./tests/workers/apply-migrations.ts"],
    },
  };
});
