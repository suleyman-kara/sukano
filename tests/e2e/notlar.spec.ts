import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { AUTH_STATES, PERSIST_DIR } from "./ortam";
import { ac, gorunum, kararliKutu } from "./yardimcilar";

/**
 * Kişisel notlar (Aşama 1) uçtan uca. Oturum: global kurulumun ürettiği
 * `ayse@test.sukano` storageState'i (playwright.config.ts varsayılanı). Üç görünüm aynı
 * hesapla paralel koştuğu için her test kendi notunu benzersiz başlıkla oluşturur ve
 * yalnızca onunla çalışır.
 */

const dokunmatik = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);
const benzersiz = (ad: string) => `${ad} ${Math.random().toString(36).slice(2, 8)}`;

const kart = (page: Page, baslik: string) =>
  page
    .locator("article[data-note-id]")
    .filter({ has: page.getByRole("heading", { name: baslik }) });

/** Eylemin /api/notlar isteği ve ardından gelen yeniden doğrulama bitene kadar bekler. */
async function sunucuyaGitsin(page: Page, eylem: () => Promise<void>) {
  const post = page.waitForResponse(
    (r) => r.url().includes("/api/notlar") && r.request().method() === "POST",
  );
  const yeniden = post.then(() =>
    page.waitForResponse((r) => r.url().includes(".data") && r.request().method() === "GET"),
  );
  await eylem();
  await yeniden;
}

async function notOlustur(page: Page, baslik: string, govde = "") {
  if (gorunum(test.info()) === "mobil") {
    await page.locator("div.fixed").getByRole("button", { name: "Not al…" }).click();
  } else {
    await page.locator("#not-al").click();
  }
  const form = page.getByRole("form", { name: "Yeni not" });
  await form.getByLabel("Not başlığı").fill(baslik);
  if (govde) {
    await form.getByRole("textbox", { name: "Not", exact: true }).click();
    await page.keyboard.type(govde);
  }
  await sunucuyaGitsin(page, () => form.getByRole("button", { name: "Kapat" }).click());
  await expect(kart(page, baslik)).toBeVisible();
}

/** Kart eylemi: masaüstünde eylem çubuğu, dokunmatikte ⋯ sayfası. */
async function kartEylemi(page: Page, k: Locator, eylem: string) {
  if (await dokunmatik(page)) {
    await k.getByRole("button", { name: /: işlemler$/ }).click();
    const sayfa = page.getByRole("dialog", { name: /not işlemleri/i });
    await sayfa.getByRole("menuitem", { name: eylem }).click();
    await expect(sayfa).toBeHidden();
  } else {
    await k.hover();
    await k.getByRole("button", { name: eylem, exact: true }).click();
  }
}

async function renkVer(page: Page, k: Locator, renk: string) {
  if (await dokunmatik(page)) {
    await k.getByRole("button", { name: /: işlemler$/ }).click();
    const sayfa = page.getByRole("dialog", { name: /not işlemleri/i });
    await sayfa.getByRole("button", { name: renk, exact: true }).click();
    await sayfa.getByRole("button", { name: "Bitti" }).click();
  } else {
    await k.hover();
    await k.getByRole("button", { name: "Renk" }).click();
    await page
      .getByRole("group", { name: "Not rengi" })
      .getByRole("button", { name: renk })
      .click();
    await page.keyboard.press("Escape");
  }
}

test.describe("kişisel notlar", () => {
  test("not oluşturulur, renk verilir ve sabitlenir", { tag: "@duman" }, async ({ page }) => {
    await ac(page, "/");
    const baslik = benzersiz("Alışveriş");
    await notOlustur(page, baslik, "Süt ve ekmek");
    const k = kart(page, baslik);
    await expect(k).toContainText("Süt ve ekmek");

    await renkVer(page, k, "Mor");
    await expect(k).toHaveAttribute("data-color", "mor");

    if (await dokunmatik(page)) await kartEylemi(page, k, "Sabitle");
    else {
      await k.hover();
      await k.getByRole("button", { name: "Sabitle" }).click();
    }
    await expect(
      page
        .getByRole("list", { name: "Sabitlenmiş notlar" })
        .locator(`article`, { hasText: baslik }),
    ).toBeVisible();

    await page.reload();
    await expect(kart(page, baslik)).toHaveAttribute("data-color", "mor");
    await expect(page.getByRole("list", { name: "Sabitlenmiş notlar" })).toContainText(baslik);
  });

  test("boş not al alanı kapatılınca not oluşmaz", async ({ page }) => {
    await ac(page, "/");
    const basliksiz = page.getByRole("link", { name: "Başlıksız not" });
    const once = await basliksiz.count();
    if (gorunum(test.info()) === "mobil") {
      await page.locator("div.fixed").getByRole("button", { name: "Not al…" }).click();
    } else {
      await page.locator("#not-al").click();
    }
    await page
      .getByRole("form", { name: "Yeni not" })
      .getByRole("button", { name: "Kapat" })
      .click();
    await expect(page.getByRole("form", { name: "Yeni not" })).toBeHidden();
    await page.waitForLoadState("networkidle");
    await expect(basliksiz).toHaveCount(once);
  });

  test("arşivle → arşivden çıkar", { tag: "@duman" }, async ({ page }) => {
    await ac(page, "/");
    const baslik = benzersiz("Arşivlik");
    await notOlustur(page, baslik);
    await kartEylemi(page, kart(page, baslik), "Arşivle");
    await expect(page.getByText("Not arşivlendi")).toBeVisible();
    await expect(kart(page, baslik)).toBeHidden();

    await page
      .getByRole("navigation", { name: "Görünüm" })
      .filter({ visible: true })
      .getByRole("link", { name: "Arşiv" })
      .click();
    await expect(page).toHaveURL(/\/arsiv$/);
    const k = kart(page, baslik);
    await expect(k).toBeVisible();
    await kartEylemi(page, k, "Arşivden çıkar");
    await expect(k).toBeHidden();

    await page
      .getByRole("navigation", { name: "Görünüm" })
      .filter({ visible: true })
      .getByRole("link", { name: "Notlar" })
      .click();
    await expect(kart(page, baslik)).toBeVisible();
  });

  test("çöpe at → toast'taki Geri al notu geri getirir", { tag: "@duman" }, async ({ page }) => {
    await ac(page, "/");
    const baslik = benzersiz("Çöplük");
    await notOlustur(page, baslik);
    await kartEylemi(page, kart(page, baslik), "Çöpe at");
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Not çöpe atıldı" });
    await expect(toast).toBeVisible();
    await expect(kart(page, baslik)).toBeHidden();
    await toast.getByRole("button", { name: "Geri al" }).click();
    await expect(kart(page, baslik)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(kart(page, baslik)).toBeVisible();
  });

  test("çöpten geri yükleme ve kalıcı silme", async ({ page }) => {
    await ac(page, "/");
    const geri = benzersiz("Geri gelecek");
    const sil = benzersiz("Silinecek");
    await notOlustur(page, geri);
    await notOlustur(page, sil);
    await kartEylemi(page, kart(page, geri), "Çöpe at");
    await kartEylemi(page, kart(page, sil), "Çöpe at");
    await page.waitForLoadState("networkidle");

    await ac(page, "/cop");
    await expect(page.getByText("Çöp · 7 gün sonra kalıcı silinir")).toBeVisible();
    const k = kart(page, geri);
    await expect(k).toContainText("7 gün sonra silinir");
    if (!(await dokunmatik(page))) await k.hover();
    await k.getByRole("button", { name: "Geri yükle" }).click();
    await expect(k).toBeHidden();

    const s = kart(page, sil);
    if (!(await dokunmatik(page))) await s.hover();
    await s.getByRole("button", { name: "Kalıcı olarak sil" }).click();
    const onay = page.getByRole("alertdialog", { name: "Not kalıcı olarak silinsin mi?" });
    await expect(onay).toContainText(sil);
    await onay.getByRole("button", { name: "Kalıcı olarak sil" }).click();
    await expect(s).toBeHidden();

    await ac(page, "/");
    await expect(kart(page, geri)).toBeVisible();
    await expect(kart(page, sil)).toBeHidden();
  });

  test(
    "arama Türkçe harf duyarsız bulur ve eşleşmeyi vurgular",
    { tag: "@duman" },
    async ({ page }) => {
      await ac(page, "/");
      const ek = Math.random().toString(36).slice(2, 8);
      const baslik = `Işıklı bahçe ${ek}`;
      await notOlustur(page, baslik, "Gölgelik ve çiçekler");

      const arama = page.getByRole("search").getByLabel("Ara");
      await arama.fill(`isikli bahce ${ek}`);
      await arama.press("Enter");
      await expect(page).toHaveURL(/\/ara\?q=/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("için 1 sonuç");
      const sonuc = page.getByRole("link", { name: new RegExp(baslik) });
      await expect(sonuc).toContainText("Notlarım");
      await expect(sonuc.locator("mark").first()).toHaveText("Işıklı");

      await arama.fill(`yokboylebirsey${ek}`);
      await arama.press("Enter");
      await expect(page.getByRole("heading", { name: /için sonuç yok/ })).toBeVisible();

      await ac(page, `/ara?q=${encodeURIComponent(`isikli bahce ${ek}`)}`);
      await page.getByRole("link", { name: new RegExp(baslik) }).click();
      await expect(page).toHaveURL(/\/not\//);
      await expect(page.getByRole("dialog").getByLabel("Not başlığı")).toHaveValue(baslik);
    },
  );

  test("açık not düzenlenir ve otomatik kaydedilir", async ({ page }) => {
    await ac(page, "/");
    const baslik = benzersiz("Düzenlenecek");
    await notOlustur(page, baslik, "İlk satır");
    await kart(page, baslik).getByRole("link").click();
    const dialog = page.getByRole("dialog");
    await expect(page).toHaveURL(/\/not\//);
    const yeni = `${baslik} güncel`;
    await dialog.getByLabel("Not başlığı").fill(yeni);
    // Metin gövdesi not odasıyla ilk eşitlemeden sonra düzenlenebilir olur; daha önce
    // yazılan tuşlar salt okunur editöre gider ve kaybolur (eski kararsızlığın kökü).
    const govde = dialog.getByRole("textbox", { name: "Not", exact: true });
    await expect(govde).toHaveAttribute("contenteditable", "true");
    await govde.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" eklendi");
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    await expect(kart(page, yeni)).toContainText("İlk satır eklendi");
    await page.reload();
    await expect(kart(page, yeni)).toContainText("İlk satır eklendi");
  });

  // Sıralama testleri Süleyman'ın oturumuyla koşar: Ayşe'nin ızgarasına paralel testlerin
  // eklediği notlar kartları sürükleme ve Alt+ok sırasında kaydırıyordu.
  test.describe("sıralama (ayrı hesap)", () => {
    test.use({ storageState: AUTH_STATES.suleyman });

    test("sürükleyerek sıralama", async ({ page }) => {
      test.skip(gorunum(test.info()) !== "masaustu", "Sürükleme fareyle, masaüstünde");
      await ac(page, "/");
      const a = benzersiz("Sıra A");
      const b = benzersiz("Sıra B");
      await notOlustur(page, a);
      await notOlustur(page, b);
      const diger = page.getByRole("list", { name: /Diğer notlar|Notlar/ });
      const sira = async () => {
        const basliklar = await diger.locator("article h3").allTextContents();
        return { a: basliklar.indexOf(a), b: basliklar.indexOf(b) };
      };
      expect((await sira()).b).toBeLessThan((await sira()).a);

      const kaynak = kart(page, a);
      const hedef = kart(page, b);
      // Yeni kartlar ızgarada kayarken (Motion layout) ölçülmesin.
      const kb = await kararliKutu(kaynak);
      const hb = await kararliKutu(hedef);
      await page.mouse.move(kb.x + kb.width / 2, kb.y + 20);
      await page.mouse.down();
      await page.mouse.move(kb.x + kb.width / 2 + 10, kb.y + 30, { steps: 5 });
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 15 });
      await page.mouse.up();

      await expect
        .poll(async () => {
          const s = await sira();
          return s.a < s.b;
        })
        .toBe(true);
      await page.waitForLoadState("networkidle");
      await page.reload();
      const s = await sira();
      expect(s.a).toBeLessThan(s.b);
    });

    test("klavyeyle sıralama: odaklı kartta Alt+ok", async ({ page }) => {
      test.skip(gorunum(test.info()) !== "masaustu", "Klavye akışı masaüstünde");
      await ac(page, "/");
      const a = benzersiz("Klavye A");
      const b = benzersiz("Klavye B");
      await notOlustur(page, a);
      await notOlustur(page, b);
      const diger = page.getByRole("list", { name: /Diğer notlar|Notlar/ });
      const basliklar = () => diger.locator("article h3").allTextContents();
      // Komşuya göre bakılır: arada başka not oluşsa bile B bir sonraki kartın ardına geçer.
      const once = await basliklar();
      expect(once.indexOf(b)).toBeLessThan(once.indexOf(a));
      const komsu = once[once.indexOf(b) + 1];
      await kararliKutu(kart(page, b));
      await kart(page, b).getByRole("link").focus();
      await expect(kart(page, b).getByRole("link")).toBeFocused();
      await page.keyboard.press("Alt+ArrowDown");
      await expect
        .poll(async () => {
          const l = await basliklar();
          return l.indexOf(b) - l.indexOf(komsu!);
        })
        .toBe(1);
      await expect(kart(page, b).getByRole("link")).toBeFocused();
      await page.waitForLoadState("networkidle");
      await page.reload();
      const sonra = await basliklar();
      expect(sonra.indexOf(b) - sonra.indexOf(komsu!)).toBe(1);
    });
  });

  test("sürüm geçmişinden eski sürüm geri yüklenir", async ({ page }) => {
    const uzak = process.env.E2E_BASE_URL && !/\/\/localhost[:/]/.test(process.env.E2E_BASE_URL);
    test.skip(Boolean(uzak), "Sürümü geriye tarihlemek için yerel D1 gerekir");
    await ac(page, "/");
    const baslik = benzersiz("Sürümlü");
    await notOlustur(page, baslik, "Birinci hali");
    await kart(page, baslik).getByRole("link").click();
    await expect(page).toHaveURL(/\/not\//);
    const id = new URL(page.url()).pathname.split("/").pop()!;

    // Aynı kişinin 5 dk içindeki düzenlemeleri tek sürümdür: ilk sürümü 10 dk geriye al.
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "sukano",
        "--local",
        "--persist-to",
        process.env.SUKANO_PERSIST_DIR ?? PERSIST_DIR,
        "--command",
        `update note_versions set created_at = created_at - 600000, updated_at = updated_at - 600000 where note_id = '${id}'`,
      ],
      { stdio: "ignore" },
    );

    const dialog = page.getByRole("dialog");
    const govde = dialog.getByRole("textbox", { name: "Not", exact: true });
    await expect(govde).toHaveAttribute("contenteditable", "true");
    await govde.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("İkinci hali");
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle");

    if (gorunum(test.info()) === "mobil") {
      await dialog.getByRole("button", { name: "Diğer" }).click();
      await page.getByRole("menuitem", { name: "Sürüm geçmişi" }).click();
    } else {
      await dialog.getByRole("button", { name: "Sürüm geçmişi" }).click();
    }
    const gecmis = page.getByRole("dialog", { name: "Sürüm geçmişi" });
    const surumler = gecmis.getByRole("option");
    await expect(surumler).toHaveCount(2);
    await expect(surumler.first()).toContainText("şu anki sürüm");
    await surumler.nth(1).click();
    await expect(gecmis.getByRole("region", { name: /Önizleme/ })).toContainText("Birinci hali");
    await gecmis
      .getByRole("button", { name: "Bu sürümü geri yükle" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("alertdialog", { name: "Bu sürüm geri yüklensin mi?" })
      .getByRole("button", { name: "Geri yükle" })
      .click();
    await expect(gecmis).toBeHidden();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Not", exact: true }),
    ).toHaveText("Birinci hali");
  });

  // Ekran düzeyindeki axe taramaları: tests/e2e/erisilebilirlik.spec.ts.
});
