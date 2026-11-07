/**
 * Yerel D1'e tohum verisi yükler: `npm run db:seed`.
 *
 *   npm run db:seed                 Önceki tohum kayıtlarını silip yeniden yükler
 *   npm run db:seed -- --sifirla    Aynısı (açık yazım; varsayılan davranış)
 *   npm run db:seed -- --ekle       Silmeden eklemeyi dener (çakışırsa hata verir)
 *   npm run db:seed -- --temizle    Yalnızca tohum kayıtlarını siler
 *
 * Önce migration'lar uygulanmış olmalı: `npm run db:migrate:local`. Wrangler'ın
 * `getPlatformProxy` yardımcısı `npm run dev` ile aynı yerel durumu
 * (`.wrangler/state/v3`) kullanır. Veri: `tests/fixtures/hesaplar.ts`, `ornek-veri.ts`.
 */
import { clearSeed, type SeedData, seedDatabase } from "../app/db/seed";
import { hesaplar } from "../tests/fixtures/hesaplar";
import { ornekKisiselAlanlar, ornekProjeler } from "../tests/fixtures/ornek-veri";

const data: SeedData = { hesaplar, projeler: ornekProjeler, kisiselAlanlar: ornekKisiselAlanlar };

const args = new Set(process.argv.slice(2));
const known = new Set(["--sifirla", "--ekle", "--temizle"]);
for (const arg of args) {
  if (!known.has(arg)) {
    console.error(`Bilinmeyen seçenek: ${arg} (geçerli: ${[...known].join(", ")})`);
    process.exit(1);
  }
}

// Yerel geliştirmede Durable Object uyarıları gürültü yapmasın.
process.env.WRANGLER_LOG ??= "error";
const { getPlatformProxy } = await import("wrangler");
const proxy = await getPlatformProxy<Env>();
try {
  if (args.has("--temizle")) {
    await clearSeed(proxy.env.DB, data);
    console.log("Tohum kayıtları silindi.");
  } else {
    const s = await seedDatabase(proxy.env.DB, data, { reset: !args.has("--ekle") });
    console.log(
      `Tohum verisi yüklendi: ${s.users} kullanıcı, ${s.projects} proje, ${s.notes} not, ${s.tasks} görev.`,
    );
    for (const h of Object.values(hesaplar)) {
      console.log(`  ${h.eposta.padEnd(24)} ${h.sifre}  ${h.ad}`);
    }
  }
} finally {
  await proxy.dispose();
}
