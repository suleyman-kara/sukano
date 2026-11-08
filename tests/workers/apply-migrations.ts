import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";

// Her test dosyası yalıtılmış yerel D1 ile başlar; şema migration'larla kurulur.
// `migrations/` yoksa ya da D1 binding'i tanımlı değilse adım atlanır.
const testEnv = env as Partial<Cloudflare.Env> & { TEST_MIGRATIONS?: D1Migration[] };
if (testEnv.DB && testEnv.TEST_MIGRATIONS?.length) {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}
