import { expect, test } from "@playwright/test";
import { OTURUMSUZ } from "./ortam";
import { ac } from "./yardimcilar";

test.use({ storageState: OTURUMSUZ });

test.describe("giriş ekranı", () => {
  test(
    "sayfa açılır; e-posta ve şifre alanları etiketleriyle vardır",
    { tag: "@duman" },
    async ({ page }) => {
      await ac(page, "/giris");
      await expect(page).toHaveTitle("Giriş yap · Sukano");

      const eposta = page.getByLabel("E-posta");
      await expect(eposta).toBeVisible();
      await expect(eposta).toHaveAttribute("id", "eposta");
      await expect(eposta).toHaveAttribute("type", "email");

      const sifre = page.getByLabel("Şifre", { exact: true });
      await expect(sifre).toBeVisible();
      await expect(sifre).toHaveAttribute("id", "sifre");
      await expect(sifre).toHaveAttribute("type", "password");

      // Google düğmesi yalnızca GOOGLE_CLIENT_ID tanımlıysa görünür (testte tanımsız).
      await expect(page.getByRole("button", { name: "Google ile devam et" })).toHaveCount(0);
      await expect(page.locator("form").getByRole("button", { name: "Giriş yap" })).toBeVisible();
    },
  );

  test("alanlara yazılabilir", async ({ page }) => {
    await ac(page, "/giris");
    await page.locator("#eposta").fill("ayse@test.sukano");
    await page.locator("#sifre").fill("Test1234!");
    await expect(page.locator("#eposta")).toHaveValue("ayse@test.sukano");
    await expect(page.locator("#sifre")).toHaveValue("Test1234!");
  });

  test("oturumsuz ana sayfa girişe yönlendirir", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/giris$/);
  });
});
