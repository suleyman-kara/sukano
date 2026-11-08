import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTURUMSUZ } from "./ortam";
import { ac, gorunum, sahteTurnstile } from "./yardimcilar";

/**
 * Erişilebilirlik turu (Aşama 6b): tüm ana ekranlar, iki tema, üç görünüm; axe'te kritik ya
 * da ciddi ihlal yok. Durum içeren ekranlar (görev ayrıntısı, tarih seçici, ek görüntüleyici,
 * bildirim paneli, iki tarayıcılı varlık) kendi özellik testlerinde ayrıca taranır.
 *
 * `oturum: false` sayfalar oturumsuz açılır (kimlik sayfaları oturumla `/`'a gider).
 */
const SAYFALAR = [
  { ad: "Notlarım", yol: "/", oturum: true },
  { ad: "Arşiv", yol: "/arsiv", oturum: true },
  { ad: "Çöp", yol: "/cop", oturum: true },
  { ad: "Arama", yol: "/ara?q=not", oturum: true },
  {
    ad: "Açık metin notu",
    yol: "/proje/web-sitesi-yenileme/not/karar-gunlugu",
    oturum: true,
    diyalog: true,
  },
  {
    ad: "Açık yapılacaklar notu",
    yol: "/proje/web-sitesi-yenileme/not/lansman-hazirligi",
    oturum: true,
    diyalog: true,
  },
  { ad: "Proje sayfası", yol: "/proje/web-sitesi-yenileme", oturum: true },
  { ad: "Proje arşivi", yol: "/proje/web-sitesi-yenileme/arsiv", oturum: true },
  { ad: "Proje ayarları", yol: "/proje/web-sitesi-yenileme/ayarlar", oturum: true },
  { ad: "Davetler", yol: "/davetler", oturum: true },
  { ad: "Silinmiş projeler", yol: "/silinmis-projeler", oturum: true },
  { ad: "Bildirimler", yol: "/bildirimler", oturum: true },
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
    .map((v) => ({
      kural: v.id,
      etki: v.impact,
      ozet: v.help,
      ornekler: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
}

test.describe("erişilebilirlik (axe)", () => {
  for (const sayfa of SAYFALAR) {
    const { ad, yol, oturum } = sayfa;
    for (const tema of ["light", "dark"] as const) {
      test.describe(() => {
        if (!oturum) test.use({ storageState: OTURUMSUZ });
        test(
          `${ad} (${yol}) ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`,
          { tag: tema === "light" ? "@duman" : undefined },
          async ({ page }) => {
            await sahteTurnstile(page);
            await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
            await ac(page, yol);
            await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
            if ("diyalog" in sayfa) {
              const dialog = page.getByRole("dialog");
              await expect(dialog).toBeVisible();
              await expect(dialog).toHaveAttribute("data-canli", "bagli");
            }
            expect(await ciddiIhlaller(page)).toEqual([]);
          },
        );
      });
    }
  }
});

test.describe("klavye", () => {
  test('ilk Tab "İçeriğe geç" bağlantısını gösterir; Enter odağı ana içeriğe taşır', async ({
    page,
  }) => {
    test.skip(gorunum(test.info()) === "mobil", "Fiziksel klavye masaüstü ve tablette");
    await ac(page, "/ayarlar");
    await page.keyboard.press("Tab");
    const atla = page.getByRole("link", { name: "İçeriğe geç" });
    await expect(atla).toBeFocused();
    await expect(atla).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#icerik")).toBeFocused();
    // Sonraki Tab ana içerikteki ilk öğeye gider (kabuk atlanır).
    await page.keyboard.press("Tab");
    const odak = await page.evaluate(() => document.activeElement?.closest("main")?.id ?? null);
    expect(odak).toBe("icerik");
  });

  test.describe(() => {
    test.use({ storageState: OTURUMSUZ });
    test('giriş ekranında da "İçeriğe geç" ilk odaktır', async ({ page }) => {
      test.skip(gorunum(test.info()) === "mobil", "Fiziksel klavye masaüstü ve tablette");
      await ac(page, "/giris");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "İçeriğe geç" })).toBeFocused();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Giriş yap" })).toBeFocused();
    });
  });

  test("odaklanan kartta görünür odak halkası vardır", async ({ page }) => {
    test.skip(gorunum(test.info()) === "mobil", "Fiziksel klavye masaüstü ve tablette");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ac(page, "/proje/web-sitesi-yenileme");
    const baglanti = page.locator("article[data-note-id] a[data-open]").first();
    await baglanti.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(baglanti).toBeFocused();
    const kart = page.locator("article[data-note-id]").first();
    const halka = await kart.evaluate((el) => {
      const s = getComputedStyle(el);
      return { stil: s.outlineStyle, genislik: parseFloat(s.outlineWidth) };
    });
    expect(halka.stil).not.toBe("none");
    expect(halka.genislik).toBeGreaterThanOrEqual(2);
  });
});
