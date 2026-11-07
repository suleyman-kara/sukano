import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTURUMSUZ } from "./ortam";
import { ac, sahteTurnstile } from "./yardimcilar";

/** `oturum: false` sayfalar oturumsuz açılır (kimlik sayfaları oturumla `/`'a gider). */
const SAYFALAR = [
  { ad: "Notlarım", yol: "/", oturum: true },
  { ad: "Ayarlar", yol: "/ayarlar", oturum: true },
  { ad: "Giriş", yol: "/giris", oturum: false },
  { ad: "Kayıt", yol: "/kayit", oturum: false },
  { ad: "Doğrulama", yol: "/dogrula?eposta=ayse%40ornek.com", oturum: false },
  { ad: "Şifremi unuttum", yol: "/sifremi-unuttum", oturum: false },
  { ad: "Şifre sıfırlama", yol: "/sifre-sifirla?token=ornek", oturum: false },
] as const;

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, etki: v.impact, ozet: v.help, ornekler: v.nodes.length }));
}

test.describe("erişilebilirlik (axe)", () => {
  for (const { ad, yol, oturum } of SAYFALAR) {
    for (const tema of ["light", "dark"] as const) {
      test.describe(() => {
        if (!oturum) test.use({ storageState: OTURUMSUZ });
        test(
          `${ad} (${yol}) ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`,
          {
            tag: tema === "light" ? "@duman" : undefined,
          },
          async ({ page }) => {
            await sahteTurnstile(page);
            await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
            await ac(page, yol);
            await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
            expect(await ciddiIhlaller(page)).toEqual([]);
          },
        );
      });
    }
  }
});
