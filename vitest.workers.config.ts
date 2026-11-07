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
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    resolve: {
      alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
    },
    test: {
      name: "workers",
      testTimeout: 60_000,
      include: ["tests/workers/**/*.test.ts"],
      setupFiles: ["./tests/workers/apply-migrations.ts"],
    },
  };
});
