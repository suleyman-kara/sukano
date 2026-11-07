import { defineConfig } from "drizzle-kit";

/**
 * Migration üretimi için. D1'e uygulama Wrangler ile yapılır
 * (`npm run db:migrate:local` / `db:migrate:remote`); drizzle-kit yalnızca
 * `migrations/` altına SQL üretir.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./migrations",
});
