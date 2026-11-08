import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { AUTH_STATES, OTURUMSUZ } from "./ortam";
import { ac, gorunum } from "./yardimcilar";

/**
 * Hareket sistemi (Aşama 6b; MotionSpec, MicroMotion): azaltılmış hareket hem sistem
 * ayarıyla (`prefers-reduced-motion`) hem Ayarlar › "Hareketi azalt" ile süs animasyonlarını
 * kapatır; tercih kalıcıdır ve sunucuda `<html data-motion>` olarak yazılır; karttan modala
 * geçiş odağı bozmaz.
 */

/** Ayar testleri her görünümde ayrı hesapla koşar (paralel görünümler aynı tercihi yarıştırmasın). */
const AYAR_HESABI = { masaustu: "suleyman", tablet: "zeynep", mobil: "mehmet" } as const;

async function ayarSayfasi(browser: Browser, info: TestInfo) {
  const kisi = AYAR_HESABI[gorunum(info)];
  const context = await browser.newContext({
    ...info.project.use,
    storageState: AUTH_STATES[kisi],
  });
  return { context, page: await context.newPage() };
}

/** Yükselen ızgara işaretlerinin animasyon adı ve çalışan animasyon sayısı. */
async function izgaraHareketi(page: Page) {
  return page
    .locator(".rising-grid-mark:visible")
    .first()
    .evaluate((el) => ({
      ad: getComputedStyle(el).animationName,
      calisan: el.getAnimations().length,
    }));
}

/** Görev kutucuğu kuralları (dolgu ve tik geçişi), sayfaya eklenen örnek kutucukta. */
async function kutucukGecisi(page: Page) {
  return page.evaluate(() => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task-cb";
    cb.checked = true;
    document.body.appendChild(cb);
    // Azaltılmış harekette 0,01 ms (Radix'in animationend'i için) → 0 sayılır.
    const sure = (v: string) =>
      Math.round(Math.max(...v.split(",").map((x) => parseFloat(x))) * 1000) / 1000;
    const sonuc = {
      dolgu: sure(getComputedStyle(cb).transitionDuration),
      tik: sure(getComputedStyle(cb, "::after").transitionDuration),
    };
    cb.remove();
    return sonuc;
  });
}

/** Hareketi azalt seçimi: radyo düğmesi + sunucu kaydı. */
async function hareketiSec(page: Page, secim: "Sistem" | "Açık" | "Kapalı") {
  const grup = page.getByRole("radiogroup", { name: "Hareketi azalt" });
  const kayit = page.waitForResponse(
    (r) => r.url().includes("/ayarlar") && r.request().method() === "POST",
  );
  await grup.getByText(secim, { exact: true }).click();
  await kayit;
  await expect(grup.getByRole("radio", { name: secim })).toBeChecked();
}

test.describe("hareket", () => {
  test.describe("giriş ekranı", () => {
    test.use({ storageState: OTURUMSUZ });

    test("yükselen ızgara hareket eder; sistem azaltılmış hareket isteyince durur", async ({
      page,
    }) => {
      test.skip(gorunum(test.info()) === "mobil", "Mobilde giriş ekranında ızgara yok");
      await ac(page, "/giris");
      await expect.poll(async () => (await izgaraHareketi(page)).ad).toBe("rising-grid");
      expect((await izgaraHareketi(page)).calisan).toBeGreaterThan(0);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(async () => (await izgaraHareketi(page)).ad).toBe("none");
      expect((await izgaraHareketi(page)).calisan).toBe(0);
    });
  });

  test("sistem azaltılmış hareket isteyince görev kutucuğunun dolgu ve tik geçişi anında olur", async ({
    page,
  }) => {
    await ac(page, "/proje/web-sitesi-yenileme/not/lansman-hazirligi");
    const kutucuk = page.locator("[role=dialog] .task-cb").first();
    await expect(kutucuk).toBeVisible();
    const gecis = () =>
      kutucuk.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(await gecis()).toBeCloseTo(0.12, 2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(gecis).toBeLessThan(0.001);
    await expect.poll(() => kutucukGecisi(page)).toEqual({ dolgu: 0, tik: 0 });
  });

  test("Ayarlar › Hareketi azalt: Açık kalıcıdır, giriş ekranına da uygulanır; Kapalı sistemi geçersiz kılar", async ({
    browser,
  }, info) => {
    test.slow(); // Ayarlar, yeniden yükleme, ikinci bağlam ve giriş ekranı: uzun akış.
    const { context, page } = await ayarSayfasi(browser, info);
    try {
      await ac(page, "/ayarlar");
      await hareketiSec(page, "Açık");
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
      expect(await kutucukGecisi(page)).toEqual({ dolgu: 0, tik: 0 });

      // Yeniden yüklemede sunucu özniteliği yazar (ilk boyamada hareket yok).
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
      await expect(
        page
          .getByRole("radiogroup", { name: "Hareketi azalt" })
          .getByRole("radio", { name: "Açık" }),
      ).toBeChecked();
      expect(await kutucukGecisi(page)).toEqual({ dolgu: 0, tik: 0 });

      // Oturumsuz giriş ekranı aynı tarayıcıda çerezden okur.
      const cerezler = (await context.cookies()).filter((c) => c.name === "sukano_hareket");
      expect(cerezler.map((c) => c.value)).toEqual(["reduced"]);
      const misafir = await browser.newContext({ ...info.project.use, storageState: OTURUMSUZ });
      try {
        await misafir.addCookies(cerezler);
        const giris = await misafir.newPage();
        await ac(giris, "/giris");
        await expect(giris.locator("html")).toHaveAttribute("data-motion", "reduced");
        if (gorunum(info) !== "mobil")
          expect(await izgaraHareketi(giris)).toEqual({ ad: "none", calisan: 0 });
      } finally {
        await misafir.close();
      }

      // Kapalı: sistem azaltılmış hareket istese de tam hareket.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await hareketiSec(page, "Kapalı");
      await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
      await expect.poll(() => kutucukGecisi(page)).toEqual({ dolgu: 0.12, tik: 0.18 });

      // Sistem: öznitelik kalkar, sistem ayarına uyulur.
      await hareketiSec(page, "Sistem");
      await expect(page.locator("html")).not.toHaveAttribute("data-motion", /.+/);
      expect(await kutucukGecisi(page)).toEqual({ dolgu: 0, tik: 0 });
      await page.reload();
      await expect(page.locator("html")).not.toHaveAttribute("data-motion", /.+/);
    } finally {
      // Hesap başka testlerde de kullanılıyor: tercih her durumda Sistem'e döner.
      await page
        .evaluate(() =>
          fetch("/ayarlar", {
            method: "POST",
            body: new URLSearchParams({ intent: "motion", motion: "system" }),
          }),
        )
        .catch(() => {});
      await context.close();
    }
  });

  test("karttan modala geçiş odağı bozmaz: açılınca odak diyalogda, kapanınca kartta", async ({
    page,
  }) => {
    // Diyaloğa uygulanan Web Animations çağrıları kaydedilir (hareket kısa; sonradan sorulamaz).
    await page.addInitScript(() => {
      const kayit: string[] = [];
      (window as unknown as { __modal: string[] }).__modal = kayit;
      const asil = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        if (this.getAttribute("role") === "dialog" && Array.isArray(keyframes))
          kayit.push(String((keyframes[0] as Keyframe | undefined)?.transform ?? ""));
        return asil.call(this, keyframes, options);
      };
    });
    await ac(page, "/proje/web-sitesi-yenileme");
    const kart = page.locator('article[data-note-id="karar-gunlugu"]');
    const baglanti = kart.locator("a[data-open]");
    await expect(kart).toBeVisible();
    await baglanti.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Kart yerinden büyür (FLIP, Web Animations API): ilk kare kartın kutusundan başlar.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __modal: string[] }).__modal))
      .toContainEqual(expect.stringMatching(/^translate\(.*scale\(/));
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]"))))
      .toBe(true);
    await expect(dialog.getByLabel("Not başlığı")).toHaveValue(/Karar günlüğü/i);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/proje\/web-sitesi-yenileme$/);
    await expect(baglanti).toBeFocused();
  });

  test("azaltılmış harekette modal anında açılır ve kapanır; odak yine kartta", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ac(page, "/proje/web-sitesi-yenileme");
    const baglanti = page.locator('article[data-note-id="karar-gunlugu"] a[data-open]');
    await baglanti.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(baglanti).toBeFocused();
  });
});
