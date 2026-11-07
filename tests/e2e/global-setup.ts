import type { FullConfig } from "@playwright/test";

/**
 * Uçtan uca testlerden önce bir kez çalışır.
 *
 * TODO(veri katmanı): `scripts/seed.ts` hazır olunca yerel D1'i sıfırlayıp
 * test hesaplarını (`tests/fixtures/hesaplar.ts`) ve örnek veriyi
 * (`tests/fixtures/ornek-veri.ts`) burada tohumla. Örneğin:
 *
 *   execFileSync("npm", ["run", "db:seed", "--", "--sifirla"], { stdio: "inherit" });
 *
 * E2E_BASE_URL ile uzak bir önizlemeye karşı koşulurken tohumlama atlanmalı
 * (önizleme veritabanı dağıtım iş akışında tohumlanır).
 */
export default async function globalSetup(_config: FullConfig) {
  if (process.env.E2E_BASE_URL) return;
  // Şimdilik yapılacak bir şey yok: Aşama 0 ekranları veritabanı kullanmıyor.
}
