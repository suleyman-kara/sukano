import { expect, test, type Browser, type Page } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { OTURUMSUZ } from "./ortam";
import { ac, gorunum } from "./yardimcilar";

/**
 * Projeler (Aşama 3b-1) uçtan uca, iki hesapla: Süleyman proje açar, Ayşe'yi davet
 * eder, Ayşe kabul eder; Süleyman Ayşe'yi görüntüleyici yapar; Ayşe görüntüleyici
 * kısıtlarını görür ve projeden ayrılır; Süleyman projeyi siler ve geri getirir.
 *
 * Üç görünüm aynı hesaplarla paralel koşar: her görünüm kendi projesini benzersiz adla
 * açar ve yalnızca onunla çalışır (tohum projelerine dokunulmaz).
 */

/** Ayrı bir tarayıcı bağlamında arayüzden giriş yapar (aynı görünüm ayarlarıyla). */
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

/** Proje eyleminin isteği ve ardından gelen yeniden doğrulama bitene kadar bekler. */
async function sunucuyaGitsin(page: Page, yol: string, eylem: () => Promise<unknown>) {
  const post = page.waitForResponse(
    (r) => r.url().includes(yol) && r.request().method() === "POST",
  );
  const yeniden = post.then(() =>
    page.waitForResponse((r) => r.url().includes(".data") && r.request().method() === "GET"),
  );
  await eylem();
  await yeniden;
}

async function gezinmeyiAc(page: Page) {
  if (gorunum(test.info()) !== "masaustu") {
    await page.getByRole("button", { name: "Gezinme menüsü" }).click();
    return page.getByRole("dialog", { name: "Ana gezinme" });
  }
  return page.getByRole("complementary");
}

test.describe("projeler", () => {
  test.describe.configure({ timeout: 120_000 });

  test("iki hesapla davet, kabul, rol değişikliği, görüntüleyici kipi, ayrılma, silme ve geri getirme", async ({
    page: ayse,
    browser,
  }) => {
    const ad = `Kış Tatili ${gorunum(test.info())} ${Math.random().toString(36).slice(2, 7)}`;
    const suleyman = await oturumAc(browser, "suleyman");
    // 1. Süleyman sol menüdeki "Yeni proje" ile proje açar.
    const nav = await gezinmeyiAc(suleyman);
    await nav.getByRole("button", { name: "Yeni proje" }).click();
    const yeni = suleyman.getByRole("dialog", { name: "Yeni proje" });
    await yeni.getByRole("button", { name: "Projeyi oluştur" }).click();
    await expect(yeni.getByText("Proje adı gerekli")).toBeVisible();
    await yeni.getByLabel("Proje adı").fill(ad);
    await yeni.getByRole("radio", { name: "Mor" }).check({ force: true });
    await yeni.getByLabel(/Açıklama/).fill("Ocakta Kars ve Erzurum");
    await yeni.getByRole("button", { name: "Projeyi oluştur" }).click();
    await suleyman.waitForURL(/\/proje\/[0-9a-f-]{36}$/);
    const projeYolu = new URL(suleyman.url()).pathname;
    await expect(suleyman.getByRole("heading", { level: 1, name: ad })).toBeVisible();
    await expect(suleyman.getByText("Bu projede henüz not yok")).toBeVisible();

    // 2. Projeye not ekler (proje notu).
    if (gorunum(test.info()) === "mobil") {
      await suleyman
        .locator("div.fixed")
        .getByRole("button", { name: "Projeye not ekle…" })
        .click();
    } else {
      await suleyman.locator("#not-al").click();
    }
    const form = suleyman.getByRole("form", { name: "Yeni not" });
    await form.getByLabel("Not başlığı").fill("Otel listesi");
    await sunucuyaGitsin(suleyman, "/api/notlar", () =>
      form.getByRole("button", { name: "Kapat" }).click(),
    );
    await expect(suleyman.getByRole("link", { name: "Otel listesi" })).toBeVisible();

    // 3. Ayarlar → davet formunun hata durumları, sonra Ayşe'ye davet.
    await suleyman.getByRole("link", { name: "Proje ayarları" }).click();
    await suleyman.waitForURL(`${projeYolu}/ayarlar`);
    const davet = suleyman.getByRole("region", { name: "Davet gönder" });
    const eposta = davet.getByLabel("E-posta");
    const gonder = davet.getByRole("button", { name: "Davet gönder" });

    await eposta.fill("hic-kimse@ornek.test");
    await gonder.click();
    await expect(
      davet.getByText("Bu adresle bir Sukano hesabı yok.", { exact: false }),
    ).toBeVisible();
    await expect(eposta).toHaveAttribute("aria-invalid", "true");

    await eposta.fill(hesaplar.suleyman.eposta);
    await gonder.click();
    await expect(davet.getByText("Süleyman Kara zaten bu projenin üyesi.")).toBeVisible();

    await eposta.fill(hesaplar.ayse.eposta);
    await sunucuyaGitsin(suleyman, "/api/projeler/", () => gonder.click());
    await expect(suleyman.getByText(`Davet gönderildi · ${hesaplar.ayse.eposta}`)).toBeVisible();
    await expect(davet.getByText(hesaplar.ayse.eposta)).toBeVisible();

    await eposta.fill(hesaplar.ayse.eposta);
    await gonder.click();
    await expect(davet.getByText("Ayşe Demir için bekleyen bir davet zaten var.")).toBeVisible();

    // Davet e-postası Davetler sayfasına bağlanır.
    await expect
      .poll(async () => {
        const res = await suleyman.request.get(
          `/__test/outbox?to=${encodeURIComponent(hesaplar.ayse.eposta)}`,
        );
        const list = (await res.json()) as { kind: string; subject: string; url: string }[];
        return list.some(
          (m) => m.kind === "davet" && m.subject.includes(ad) && m.url.endsWith("/davetler"),
        );
      })
      .toBe(true);

    // 4. Ayşe Davetler'de kabul eder; proje açılır.
    await ac(ayse, "/davetler");
    const kabul = ayse.getByRole("button", { name: `Kabul et: ${ad}` });
    await expect(ayse.getByRole("heading", { name: ad })).toBeVisible();
    await kabul.click();
    await ayse.waitForURL(projeYolu);
    await expect(ayse.getByText("Projeye katıldın")).toBeVisible();
    await expect(
      ayse.getByText(`Süleyman Kara seni ${ad} projesine düzenleyici olarak ekledi.`),
    ).toBeVisible();
    await expect(ayse.getByRole("link", { name: "Otel listesi" })).toBeVisible();

    // 5. Süleyman Ayşe'yi görüntüleyici yapar.
    await suleyman.reload();
    await suleyman.waitForLoadState("networkidle");
    await sunucuyaGitsin(suleyman, "/api/projeler/", () =>
      suleyman.getByLabel("Ayşe Demir rolü").selectOption("goruntuleyici"),
    );
    await expect(suleyman.getByLabel("Ayşe Demir rolü")).toHaveValue("goruntuleyici");

    // 6. Ayşe'nin proje sayfası görüntüleyici kipinde.
    await ac(ayse, projeYolu);
    await expect(ayse.getByText("Görüntüleyici").filter({ visible: true }).first()).toBeVisible();
    await expect(ayse.getByText("Okur ve arar; not ekleyemez, görev işaretleyemez.")).toBeVisible();
    await expect(ayse.getByRole("button", { name: "Projeye not ekle…" })).toHaveCount(0);
    await expect(ayse.getByRole("button", { name: "Davet gönder" })).toHaveCount(0);
    const kapsul = ayse.getByRole("navigation", { name: "Görünüm" }).first();
    await expect(kapsul.getByRole("link", { name: "Arşiv" })).toBeVisible();
    await expect(kapsul.getByRole("link", { name: "Çöp" })).toHaveCount(0);
    const kart = ayse.locator("article[data-note-id]").filter({ hasText: "Otel listesi" });
    await expect(kart).toBeVisible();
    await expect(kart.getByRole("button")).toHaveCount(0);

    // 7. Ayşe projeden ayrılır.
    await ayse.getByRole("link", { name: "Proje ayarları" }).click();
    await ayse.waitForURL(`${projeYolu}/ayarlar`);
    await expect(ayse.getByRole("region", { name: "Davet gönder" })).toHaveCount(0);
    await ayse
      .getByRole("region", { name: "Tehlikeli bölge" })
      .getByRole("button", { name: "Ayrıl" })
      .click();
    const ayril = ayse.getByRole("alertdialog", { name: "Projeden ayrılıyor musun?" });
    await ayril.getByRole("button", { name: "Projeden ayrıl" }).click();
    await ayse.waitForURL((url) => url.pathname === "/");
    await expect(ayse.getByText(`${ad} projesinden ayrıldın`)).toBeVisible();
    await ayse.goto(projeYolu);
    await expect(
      ayse.getByRole("heading", { name: "Bu sayfa yok ya da erişimin kaldırılmış" }),
    ).toBeVisible();

    // 8. Süleyman (artık tek yönetici) ayrılamaz; projeyi siler.
    await ac(suleyman, `${projeYolu}/ayarlar`);
    const tehlike = suleyman.getByRole("region", { name: "Tehlikeli bölge" });
    await tehlike.getByRole("button", { name: "Ayrıl" }).click();
    const tek = suleyman.getByRole("alertdialog", { name: "Projeden ayrılıyor musun?" });
    await expect(tek.getByText("Yönetici · tek yönetici")).toBeVisible();
    await expect(tek.getByRole("button", { name: "Projeden ayrıl" })).toBeDisabled();
    await tek.getByRole("button", { name: "Proje ayarlarına git" }).click();
    await expect(tek).toBeHidden();

    await tehlike.getByRole("button", { name: "Projeyi sil" }).click();
    const sil = suleyman.getByRole("alertdialog", { name: "Proje silinsin mi?" });
    await expect(sil.getByText("1 not · 1 üye")).toBeVisible();
    await sil.getByRole("button", { name: "Projeyi sil" }).click();
    await suleyman.waitForURL((url) => url.pathname === "/");

    // 9. Silinmiş projeler listesinden geri getirir.
    const nav2 = await gezinmeyiAc(suleyman);
    await nav2.getByRole("link", { name: /^Silinmiş projeler \(\d+\)$/ }).click();
    await suleyman.waitForURL("/silinmis-projeler");
    const satir = suleyman.getByRole("listitem").filter({ hasText: ad });
    await expect(satir.getByText("Sen sildin", { exact: false })).toBeVisible();
    await expect(satir.getByText("7 gün kaldı", { exact: false })).toBeVisible();
    await satir.getByRole("button", { name: `Projeyi geri getir: ${ad}` }).click();
    await suleyman.waitForURL(projeYolu);
    await expect(suleyman.getByRole("heading", { level: 1, name: ad })).toBeVisible();
    await expect(suleyman.getByRole("link", { name: "Otel listesi" })).toBeVisible();

    await suleyman.context().close();
  });
});
