import { expect, test, type Browser, type Page } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { OTURUMSUZ } from "./ortam";
import { ac, gorunum } from "./yardimcilar";

/**
 * Gerçek zamanlı duman testi (Aşama 4a): iki tarayıcı bağlamı, aynı proje notu.
 * Ayşe (varsayılan oturum) ve Mehmet (Web Sitesi Yenileme düzenleyicisi).
 * Tam iki tarayıcı matrisi (varlık avatarları, imleçler, çevrimdışı bandı) Aşama 4b'de.
 */
const WEB = "web-sitesi-yenileme";

async function oturumAc(browser: Browser, hesap: keyof typeof hesaplar): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: OTURUMSUZ });
  const page = await context.newPage();
  await ac(page, "/giris");
  await page.locator("#eposta").fill(hesaplar[hesap].eposta);
  await page.locator("#sifre").fill(hesaplar[hesap].sifre);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.waitForLoadState("networkidle");
  return page;
}

test.describe("gerçek zamanlı", () => {
  test.describe.configure({ timeout: 60_000 });

  test("canlı ızgara ve ortak düzenleme: bir sekmede yazılan diğerinde 1 sn içinde görünür @duman", async ({
    page,
    browser,
  }) => {
    test.skip(gorunum(test.info()) !== "masaustu", "İki tarayıcı matrisi Aşama 4b'de");
    const mehmet = await oturumAc(browser, "mehmet");
    await ac(mehmet, `/proje/${WEB}`);
    await ac(page, `/proje/${WEB}`);

    // Ayşe not ekler → Mehmet'in ızgarasında kanal olayıyla belirir (sayfa yenilenmeden).
    const id = crypto.randomUUID();
    const baslik = `Canlı ${Date.now().toString(36)}`;
    const res = await page.request.post("/api/notlar", {
      form: { intent: "create", id, projectId: WEB, title: baslik, bodyHtml: "<p>başlangıç</p>" },
    });
    expect(res.ok()).toBe(true);
    await expect(mehmet.locator("article", { hasText: baslik })).toBeVisible({ timeout: 5000 });

    // İkisi de notu açar; oda bağlantısı kurulunca düzenleme açılır.
    await ac(page, `/proje/${WEB}/not/${id}`);
    await ac(mehmet, `/proje/${WEB}/not/${id}`);
    const ayseNot = page.getByRole("dialog");
    const mehmetNot = mehmet.getByRole("dialog");
    await expect(ayseNot).toHaveAttribute("data-canli", "bagli");
    await expect(mehmetNot).toHaveAttribute("data-canli", "bagli");
    // Varlık: her biri diğerini görür.
    await expect(mehmetNot).toHaveAttribute("data-canli-kisi", "1");
    await expect(ayseNot).toHaveAttribute("data-canli-kisi", "1");

    const ayseGovde = ayseNot.getByRole("textbox", { name: "Not", exact: true });
    const mehmetGovde = mehmetNot.getByRole("textbox", { name: "Not", exact: true });
    await expect(ayseGovde).toHaveAttribute("contenteditable", "true");
    await ayseGovde.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" canlı yazı");
    await expect(mehmetGovde).toContainText("başlangıç canlı yazı", { timeout: 1000 });

    // Ters yön.
    await mehmetGovde.click();
    await mehmet.keyboard.press("End");
    await mehmet.keyboard.type(" ve yanıt");
    await expect(ayseGovde).toContainText("canlı yazı ve yanıt", { timeout: 1000 });

    // Kapatınca D1 kopyası yazılır; kart güncel gövdeyi gösterir.
    await mehmetNot.getByRole("button", { name: "Kapat" }).first().click();
    await expect(mehmet.locator("article", { hasText: baslik })).toContainText("ve yanıt", {
      timeout: 5000,
    });
    await mehmet.context().close();
  });
});
