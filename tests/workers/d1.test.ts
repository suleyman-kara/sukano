import { env, type D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const testEnv = env as Partial<Cloudflare.Env> & { TEST_MIGRATIONS?: D1Migration[] };
const hasMigrations = Boolean(testEnv.DB && testEnv.TEST_MIGRATIONS?.length);

describe("yerel D1", () => {
  it.skipIf(!hasMigrations)("test başlamadan tüm migration'lar uygulanmış olur", async () => {
    const { results } = await testEnv
      .DB!.prepare("SELECT name FROM d1_migrations ORDER BY id")
      .all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(testEnv.TEST_MIGRATIONS!.map((m) => m.name));
  });
});
