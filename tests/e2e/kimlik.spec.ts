import { expect, test, type Page } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { OTURUMSUZ } from "./ortam";
import { ac, epostaBaglantisi, gorunum, sahteTurnstile, yeniEposta } from "./yardimcilar";

/**
 * Kimlik akışları (Aşama 1), üç görünümde. Oturumsuz başlar; e-postalar yerel
 * posta kutusundan (`/__test/outbox`) okunur, Turnstile sahte betikle geçer.
 */
test.use({ storageState: OTURUMSUZ });

test.beforeEach(async ({ page }) => {
  await sahteTurnstile(page);
});

const SIFRE = "Guclu-sifre-2026";

/** Görünüm başına ayrı tohum hesabı: paralel projeler birbirinin oturumunu etkilemez. */
const HESAP = { masaustu: hesaplar.mehmet, tablet: hesaplar.zeynep, mobil: hesaplar.can } as const;

async function girisYap(page: Page, eposta: string, sifre: string) {
  await page.locator("#eposta").fill(eposta);
  await page.locator("#sifre").fill(sifre);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

async function cikisYap(page: Page) {
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/giris$/);
  // Çıkış tam sayfa yüklemesidir; sonraki etkileşimlerden önce hidrasyonu bekle.
  await page.waitForLoadState("networkidle");
}

test.describe("kimlik", () => {
  test(
    "e-posta ve şifreyle giriş yapılır ve çıkılır",
    { tag: "@duman" },
    async ({ page }, testInfo) => {
      const hesap = HESAP[gorunum(testInfo)];
      await ac(page, "/giris");

      await girisYap(page, hesap.eposta, "Yanlis-sifre-1");
      await expect(page.getByRole("alert")).toHaveText("E-posta ya da şifre hatalı.");

      await girisYap(page, hesap.eposta, hesap.sifre);
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("button", { name: "Hesap menüsü" })).toBeVisible();

      await cikisYap(page);
      await page.goto("/ayarlar");
      await expect(page).toHaveURL(/\/giris\?next=%2Fayarlar$/);
    },
  );

  test(
    "kayıt olunur, e-postadaki bağlantıyla doğrulanır ve yeniden giriş yapılır",
    { tag: "@duman" },
    async ({ page }, testInfo) => {
      const eposta = yeniEposta("kayit", testInfo);
      await ac(page, "/giris");
      await page.getByRole("link", { name: "Kayıt ol" }).first().click();
      await expect(page).toHaveURL(/\/kayit$/);
      await expect(page.getByText("Bu form Cloudflare Turnstile ile korunur.")).toBeVisible();

      await page.getByLabel("Ad Soyad").fill("Deniz Yılmaz");
      await page.getByLabel("E-posta").fill(eposta);
      await page.getByLabel("Şifre", { exact: true }).fill(SIFRE);
      await page.getByRole("button", { name: "Kayıt ol" }).click();

      await expect(page).toHaveURL(/\/dogrula\?eposta=/);
      await expect(page.getByRole("heading", { name: "E-postanı doğrula" })).toBeVisible();
      await expect(page.getByText(eposta)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Bağlantıyı tekrar gönder \(\d+ sn\)/ }),
      ).toBeDisabled();

      await page.goto(await epostaBaglantisi(page, eposta, "dogrulama"));
      await expect(page).toHaveURL((url) => url.pathname === "/");

      await cikisYap(page);
      await girisYap(page, eposta, SIFRE);
      await expect(page).toHaveURL((url) => url.pathname === "/");
    },
  );

  test(
    "şifremi unuttum bağlantısıyla yeni şifre belirlenir ve giriş yapılır",
    { tag: "@duman" },
    async ({ page }, testInfo) => {
      // Hazırlık: doğrulanmış yeni bir hesap (tohum hesaplarının şifresi değişmesin).
      const eposta = yeniEposta("sifirla", testInfo);
      await ac(page, "/kayit");
      await page.getByLabel("Ad Soyad").fill("Sıfırlama Testi");
      await page.getByLabel("E-posta").fill(eposta);
      await page.getByLabel("Şifre", { exact: true }).fill(SIFRE);
      await page.getByRole("button", { name: "Kayıt ol" }).click();
      await expect(page).toHaveURL(/\/dogrula\?/);
      await page.goto(await epostaBaglantisi(page, eposta, "dogrulama"));
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await cikisYap(page);

      await page.getByRole("link", { name: "Şifremi unuttum" }).click();
      await expect(page.getByRole("heading", { name: "Şifreni sıfırla" })).toBeVisible();
      await page.getByLabel("E-posta").fill(eposta);
      await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
      await expect(page.getByRole("heading", { name: "E-postanı kontrol et" })).toBeVisible();

      await page.goto(await epostaBaglantisi(page, eposta, "sifre-sifirlama"));
      await expect(page.getByRole("heading", { name: "Yeni şifre belirle" })).toBeVisible();
      await page.getByLabel("Yeni şifre", { exact: true }).fill("Yepyeni-sifre-26");
      await page.getByLabel("Yeni şifre (tekrar)").fill("Yepyeni-sifre-27");
      await page.getByRole("button", { name: "Şifreyi kaydet ve giriş yap" }).click();
      await expect(page.getByText("Şifreler aynı değil.")).toBeVisible();

      await page.getByLabel("Yeni şifre (tekrar)").fill("Yepyeni-sifre-26");
      await page.getByRole("button", { name: "Şifreyi kaydet ve giriş yap" }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("button", { name: "Hesap menüsü" })).toBeVisible();
    },
  );

  test("kayıt formu boş gönderilince alan hatalarını gösterir", async ({ page }) => {
    await ac(page, "/kayit");
    await page.getByRole("button", { name: "Kayıt ol" }).click();
    await expect(page.getByText("Adını yaz.")).toBeVisible();
    await expect(page.getByText("E-posta gerekli.")).toBeVisible();
    await expect(page.getByText("Şifre gerekli.")).toBeVisible();
    await expect(page.getByLabel("Ad Soyad")).toBeFocused();
  });

  test("şifre göster/gizle düğmesi çalışır", async ({ page }) => {
    await ac(page, "/giris");
    const sifre = page.locator("#sifre");
    await sifre.fill("Gizli-1234");
    await expect(sifre).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Şifreyi göster" }).click();
    await expect(sifre).toHaveAttribute("type", "text");
  });
});
