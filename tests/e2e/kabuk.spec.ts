import { expect, test } from "@playwright/test";
import { ac, gorunum, menuDugmesi } from "./yardimcilar";

test.describe("uygulama kabuğu", () => {
  test(
    "ana sayfa açılır; arama, Not al ve hesap menüsü görünür",
    { tag: "@duman" },
    async ({ page }) => {
      await ac(page, "/");
      await expect(page).toHaveTitle("Notlarım · Sukano");
      await expect(page.getByRole("heading", { level: 1, name: "Notlarım" })).toBeVisible();
      await expect(page.getByRole("search").getByLabel("Ara")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Not al…" }).filter({ visible: true }),
      ).toBeVisible();
      await expect(menuDugmesi(page)).toBeVisible();
      await expect(page.getByRole("button", { name: "Hesap menüsü" })).toBeVisible();
    },
  );

  test(
    "masaüstünde logo düğmesi sol paneli raya geçirir ve durum yeniden yüklemede korunur",
    {
      tag: "@duman",
    },
    async ({ page }, testInfo) => {
      test.skip(gorunum(testInfo) !== "masaustu", "Kalıcı panel yalnızca ≥ 1024 px");
      await ac(page, "/");
      const html = page.locator("html");
      const panel = page.locator("aside").filter({ has: page.getByRole("navigation") });
      const menu = panel.locator("button.logo-tg");

      await expect(html).toHaveAttribute("data-nav", "open");
      await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toBeVisible();
      // Üst çubukta hamburger yok (yalnızca mobilde).
      await expect(page.getByRole("button", { name: "Gezinme menüsü" })).toBeHidden();
      await expect(menu).toHaveAccessibleName("Menüyü kapat");
      await expect(menu).toHaveAttribute("aria-expanded", "true");

      await menu.click();
      await expect(html).toHaveAttribute("data-nav", "rail");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toHaveAccessibleName("Menüyü aç");
      await expect.poll(async () => (await panel.boundingBox())?.width).toBe(72);

      await page.reload();
      await expect(html).toHaveAttribute("data-nav", "rail");
      await page.waitForLoadState("networkidle");

      await menu.click();
      await expect(html).toHaveAttribute("data-nav", "open");
      await expect.poll(async () => (await panel.boundingBox())?.width).toBe(248);
    },
  );

  test(
    "dar ekranda menü düğmesi gezinme çekmecesini açar ve bağlantıyla kapanır",
    {
      tag: "@duman",
    },
    async ({ page }, testInfo) => {
      test.skip(gorunum(testInfo) === "masaustu", "Çekmece yalnızca < 1024 px");
      await ac(page, "/");
      // Tablette sol üstteki logo, mobilde üst çubuktaki hamburger.
      const ad = gorunum(testInfo) === "tablet" ? "Menüyü aç" : "Gezinme menüsü";
      const menu = page.getByRole("button", { name: ad });
      await expect(menu).toHaveAttribute("aria-expanded", "false");

      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Ana gezinme" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Ayarlar" })).toBeVisible();
      // Modal çekmece açıkken arka plan aria-hidden olur; düğmeye öznitelikle erişilir.
      const tetik =
        gorunum(testInfo) === "tablet"
          ? page.locator("aside button.logo-tg")
          : page.locator('button[aria-label="Gezinme menüsü"]');
      await expect(tetik).toHaveAttribute("aria-expanded", "true");
      // Masaüstü panel durumu çekmeceden etkilenmez.
      await expect(page.locator("html")).toHaveAttribute("data-nav", "open");

      await drawer.getByRole("link", { name: "Notlarım" }).click();
      await expect(drawer).toBeHidden();
    },
  );

  test("logonun üzerine gelince ya da odaklanınca hamburger belirir, tıklama paneli açıp kapatır", async ({
    page,
  }, testInfo) => {
    test.skip(gorunum(testInfo) !== "masaustu", "Üzerine gelme fareyle, masaüstünde");
    await ac(page, "/");
    const html = page.locator("html");
    const menu = page.locator("aside button.logo-tg");
    const burger = menu.locator(".logo-burger");
    const mark = menu.locator(".logo-mark");
    const opacity = (l: typeof burger) => l.evaluate((e) => getComputedStyle(e).opacity);
    await expect.poll(() => opacity(burger)).toBe("0");
    await expect.poll(() => opacity(mark)).toBe("1");
    await menu.hover();
    await expect.poll(() => opacity(burger)).toBe("1");
    await expect.poll(() => opacity(mark)).toBe("0");
    await expect(page.getByRole("tooltip")).toHaveText("Menüyü kapat");
    await menu.click();
    await expect(html).toHaveAttribute("data-nav", "rail");
    // Fare ayrılınca logo geri gelir; klavye odağında hamburger yine görünür.
    await page.mouse.move(700, 500);
    await expect.poll(() => opacity(burger)).toBe("0");
    await menu.blur();
    await page.keyboard.press("Tab");
    await menu.focus();
    await expect.poll(() => opacity(burger)).toBe("1");
    await page.keyboard.press("Enter");
    await expect(html).toHaveAttribute("data-nav", "open");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
  });

  test("görünüm seçicide yalnızca etkin görünüm etiketlidir; geçişte etiket yenisinde açılır", async ({
    page,
  }, testInfo) => {
    test.skip(gorunum(testInfo) === "mobil", "Mobilde etiket yok");
    await ac(page, "/");
    const secici = page.getByRole("banner").getByRole("navigation", { name: "Görünüm" });
    const genislik = async (ad: string) =>
      (await secici.getByRole("link", { name: ad }).boundingBox())!.width;
    await expect(secici.getByRole("link", { name: "Notlar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect.poll(() => genislik("Arşiv")).toBeLessThan(46);
    await expect.poll(() => genislik("Notlar")).toBeGreaterThan(60);
    await secici.getByRole("link", { name: "Arşiv" }).click();
    await expect(page).toHaveURL(/\/arsiv$/);
    const yeni = page.getByRole("banner").getByRole("navigation", { name: "Görünüm" });
    await expect(yeni.getByRole("link", { name: "Arşiv" })).toHaveAttribute("aria-current", "page");
    const yeniGenislik = async (ad: string) =>
      (await yeni.getByRole("link", { name: ad }).boundingBox())!.width;
    await expect.poll(() => yeniGenislik("Arşiv")).toBeGreaterThan(55);
    await expect.poll(() => yeniGenislik("Notlar")).toBeLessThan(46);
  });

  test("Ayarlar içeriği ortalanır: masaüstünde en çok 880, tablette 680 px", async ({
    page,
  }, testInfo) => {
    const g = gorunum(testInfo);
    test.skip(g === "mobil", "Mobilde tam genişlik");
    await ac(page, "/ayarlar");
    const icerik = page.locator("[data-ayarlar]");
    const ana = page.locator("main#icerik");
    const k = (await icerik.boundingBox())!;
    const m = (await ana.boundingBox())!;
    expect(k.width).toBeLessThanOrEqual(g === "masaustu" ? 880 : 680);
    // Sol ve sağ boşluk eşit (ortalanmış).
    expect(Math.abs(k.x - m.x - (m.x + m.width - (k.x + k.width)))).toBeLessThan(2);
  });

  test("mobilde kalıcı sol panel gizlidir, tablette ray olarak görünür", async ({
    page,
  }, testInfo) => {
    const g = gorunum(testInfo);
    test.skip(g === "masaustu", "Masaüstü ayrı testte");
    await ac(page, "/");
    const panel = page.locator("aside").filter({ has: page.getByRole("navigation") });
    if (g === "mobil") {
      await expect(panel).toBeHidden();
    } else {
      await expect(panel).toBeVisible();
    }
  });

  test(
    "hesap menüsünden seçilen tema uygulanır ve yeniden yüklemede korunur",
    {
      tag: "@duman",
    },
    async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await ac(page, "/");
      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-theme", "light");

      await page.getByRole("button", { name: "Hesap menüsü" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Ayarlar" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Çıkış yap" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Tema" }).click();
      await page.getByRole("menuitemradio", { name: "Koyu" }).click();

      await expect(html).toHaveAttribute("data-theme", "dark");
      await expect(html).toHaveAttribute("data-theme-pref", "dark");
      expect(await page.evaluate(() => localStorage.getItem("sukano:tema"))).toBe("dark");

      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "dark");
    },
  );

  test("tema 'Sistem' iken işletim sistemi şemasını izler", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await ac(page, "/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});
