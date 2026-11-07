import { expect, test } from "@playwright/test";
import { ac, gorunum } from "./yardimcilar";

test.describe("uygulama kabuğu", () => {
  test(
    "ana sayfa açılır; arama, Not al ve hesap menüsü görünür",
    { tag: "@duman" },
    async ({ page }) => {
      await ac(page, "/");
      await expect(page).toHaveTitle("Notlarım · Sukano");
      await expect(page.getByRole("heading", { level: 1, name: "Notlarım" })).toBeVisible();
      await expect(page.getByRole("search").getByLabel("Ara")).toBeVisible();
      await expect(page.locator("#not-al")).toBeVisible();
      await expect(page.getByRole("button", { name: "Gezinme menüsü" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Hesap menüsü" })).toBeVisible();
    },
  );

  test(
    "masaüstünde hamburger sol paneli raya geçirir ve durum yeniden yüklemede korunur",
    {
      tag: "@duman",
    },
    async ({ page }, testInfo) => {
      test.skip(gorunum(testInfo) !== "masaustu", "Kalıcı panel yalnızca ≥ 1024 px");
      await ac(page, "/");
      const html = page.locator("html");
      const panel = page.locator("aside").filter({ has: page.getByRole("navigation") });
      const menu = page.getByRole("button", { name: "Gezinme menüsü" });

      await expect(html).toHaveAttribute("data-nav", "open");
      await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "true");

      await menu.click();
      await expect(html).toHaveAttribute("data-nav", "rail");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
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
    "dar ekranda hamburger gezinme çekmecesini açar ve bağlantıyla kapanır",
    {
      tag: "@duman",
    },
    async ({ page }, testInfo) => {
      test.skip(gorunum(testInfo) === "masaustu", "Çekmece yalnızca < 1024 px");
      await ac(page, "/");
      const menu = page.getByRole("button", { name: "Gezinme menüsü" });
      await expect(menu).toHaveAttribute("aria-expanded", "false");

      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Ana gezinme" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Ayarlar" })).toBeVisible();
      // Modal çekmece açıkken arka plan aria-hidden olur; düğmeye öznitelikle erişilir.
      await expect(page.locator('button[aria-label="Gezinme menüsü"]')).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      // Masaüstü panel durumu çekmeceden etkilenmez.
      await expect(page.locator("html")).toHaveAttribute("data-nav", "open");

      await drawer.getByRole("link", { name: "Notlarım" }).click();
      await expect(drawer).toBeHidden();
    },
  );

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
