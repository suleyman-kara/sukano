import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { BASE_URL, OTURUMSUZ, PERSIST_DIR } from "./ortam";
import { ac, gorunum } from "./yardimcilar";

/**
 * Proje notları (Aşama 3b-2) uçtan uca, üç görünümde: kişisel notu projeye taşıma ve
 * "Geri al", proje notunu kişisel alana kopyalama, görev atama (klavye / mobil kişi
 * sayfası), görüntüleyicinin salt okunur notu, birleşik arama ve yazar satırı.
 * Oturum varsayılan olarak `ayse@test.sukano`; görüntüleyici Can (Fotoğraf Arşivi).
 */

const benzersiz = (ad: string) => `${ad} ${Math.random().toString(36).slice(2, 8)}`;
const dokunmatik = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

/**
 * Tohum hesabının oturumu (çalışma başına bir giriş: giriş hız sınırı e-posta başına
 * dakikada 5). Paralel işçiler kilit dosyasıyla sıraya girer; kayıtlı oturum geçerliyse
 * yeniden kullanılır.
 */
async function oturum(browser: Browser, anahtar: "can"): Promise<string> {
  const yol = `tests/e2e/.auth/${anahtar}-${PERSIST_DIR.replace(/\W+/g, "_")}.json`;
  const kilit = `${yol}.kilit`;
  mkdirSync(dirname(yol), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(kilit, "wx"));
      break;
    } catch {
      if (i > 300) rmSync(kilit, { force: true });
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    if (existsSync(yol)) {
      const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: yol });
      const res = await ctx.request.get("/api/projeler", { maxRedirects: 0 });
      await ctx.close();
      if (res.ok()) return yol;
    }
    // Testteki `browser.newContext` proje ayarlarını (Ayşe oturumu dahil) devralır.
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: OTURUMSUZ });
    const page = await ctx.newPage();
    await page.goto("/giris");
    await page.waitForLoadState("networkidle");
    await page.locator("#eposta").fill(hesaplar[anahtar].eposta);
    await page.locator("#sifre").fill(hesaplar[anahtar].sifre);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
    await ctx.storageState({ path: yol });
    await ctx.close();
    return yol;
  } finally {
    rmSync(kilit, { force: true });
  }
}

async function metinNotu(page: Page, baslik: string, projectId?: string) {
  const id = randomUUID();
  const form: Record<string, string> = {
    intent: "create",
    id,
    title: baslik,
    bodyHtml: "<p>Uçtan uca deneme</p>",
    color: "default",
    pinned: "false",
  };
  if (projectId) form.projectId = projectId;
  const res = await page.request.post("/api/notlar", { form });
  expect(res.ok()).toBe(true);
  return id;
}

async function yapilacaklar(page: Page, baslik: string, gorevler: string[], projectId: string) {
  const id = randomUUID();
  const res = await page.request.post("/api/notlar", {
    form: {
      intent: "create-todo",
      id,
      title: baslik,
      color: "default",
      pinned: "false",
      tasks: "[]",
      projectId,
    },
  });
  expect(res.ok()).toBe(true);
  const ops = gorevler.map((title, i) => ({
    op: "create",
    id: randomUUID(),
    parentId: null,
    position: i,
    title,
    completed: false,
  }));
  const r = await page.request.post(`/api/notlar/${id}/gorevler`, { data: { ops } });
  expect(r.ok()).toBe(true);
  return id;
}

const notDiyalogu = (page: Page, baslik: string) => page.getByRole("dialog", { name: baslik });

/** Not menüsündeki bir eylem: masaüstü/tablette alt çubuk düğmesi, mobilde ⋯ sayfası. */
async function notEylemi(page: Page, baslik: string, ad: string) {
  const dlg = notDiyalogu(page, baslik);
  if (gorunum(test.info()) === "mobil") {
    await dlg.getByRole("button", { name: "Diğer" }).click();
    await page.getByRole("menuitem", { name: ad }).click();
  } else {
    await dlg.getByRole("button", { name: ad }).click();
  }
}

const kaydedilsin = (page: Page) =>
  page.waitForResponse(
    (r) => /\/gorevler$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
  );

test.describe("proje notları", () => {
  test("kişisel not projeye taşınır; toast'taki Geri al notu Notlarım'a döndürür", async ({
    page,
  }) => {
    const baslik = benzersiz("Taşınacak not");
    const id = await metinNotu(page, baslik);
    await ac(page, `/not/${id}`);
    await notEylemi(page, baslik, "Taşı veya kopyala…");
    const tasi = page.getByRole("dialog", { name: "Notu projeye taşı" });
    // Ayşe Ev Taşınma'da düzenleyici, Web Sitesi Yenileme'de yönetici.
    await tasi.getByRole("radio", { name: /Ev Taşınma/ }).click();
    await tasi.getByRole("button", { name: "Ev Taşınma projesine taşı" }).click();
    await expect(page).toHaveURL(/\/$/);
    const toast = page.locator("[data-sonner-toast]", {
      hasText: "Not Ev Taşınma projesine taşındı",
    });
    await expect(toast).toBeVisible();
    await expect(page.locator(`[data-note-id="${id}"]`)).toBeHidden();

    // Proje sayfasında not görünür.
    const proje = await page.request.get("/api/projeler/ev-tasinma");
    expect(JSON.stringify(await proje.json())).toContain(baslik);

    await toast.getByRole("button", { name: "Geri al" }).click();
    await expect(page.getByText("Taşıma geri alındı; not Notlarım'a döndü")).toBeVisible();
    await expect(page.locator(`[data-note-id="${id}"]`)).toBeVisible();
  });

  test("proje notu kişisel alana kopyalanır; asıl not projede kalır", async ({ page }) => {
    const baslik = benzersiz("Proje notu kopya");
    const id = await metinNotu(page, baslik, "web-sitesi-yenileme");
    await ac(page, `/proje/web-sitesi-yenileme/not/${id}`);
    await notEylemi(page, baslik, "Kopyala…");
    const kopyala = page.getByRole("dialog", { name: "Notu kopyala" });
    await expect(kopyala).toContainText("Proje notu taşınamaz, yalnızca kopyalanır.");
    await expect(kopyala.getByRole("radio", { name: /Kişisel alanım/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await kopyala.getByRole("button", { name: "Kişisel alanıma kopyala" }).click();
    await expect(page.getByText("Kopya Notlarım'da oluşturuldu")).toBeVisible();
    await expect(kopyala).toBeHidden();
    await expect(notDiyalogu(page, baslik)).toBeVisible();

    await ac(page, "/");
    await expect(page.locator("article", { hasText: baslik })).toBeVisible();
    await ac(page, "/proje/web-sitesi-yenileme");
    await expect(page.locator(`[data-note-id="${id}"]`)).toBeVisible();
  });

  test("görev bir üyeye yalnızca klavyeyle atanır (Ctrl+Shift+A, oklar, Enter)", async ({
    page,
  }, testInfo) => {
    test.skip(gorunum(testInfo) !== "masaustu", "klavye akışı masaüstünde");
    const baslik = benzersiz("Atama klavye");
    const id = await yapilacaklar(page, baslik, ["Sunum taslağı"], "web-sitesi-yenileme");
    await ac(page, `/proje/web-sitesi-yenileme/not/${id}`);
    const satir = page.locator('input[data-task-input][value="Sunum taslağı"]');
    await satir.focus();
    await page.keyboard.press("Control+Shift+A");
    const liste = page.getByRole("listbox", { name: "Kişiye ata: Sunum taslağı" });
    await expect(liste.getByRole("option").first()).toBeFocused();
    await expect(liste.getByRole("option").first()).toContainText("Ayşe Demir (sen)");
    // Sıra: sen, yöneticiler, düzenleyiciler, görüntüleyiciler (ad sırasıyla).
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(liste.getByRole("option", { name: /Mehmet Kaya/ })).toBeFocused();
    const yanit = kaydedilsin(page);
    await page.keyboard.press("Enter");
    await yanit;
    await expect(liste.getByRole("option", { name: /Mehmet Kaya/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(liste).toBeHidden();
    await expect(satir).toBeFocused();
    await expect(notDiyalogu(page, baslik)).toBeVisible();
    const row = page.locator("[data-task-row]", { has: satir });
    await expect(row.getByText("Atananlar: Mehmet Kaya")).toBeAttached();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(notDiyalogu(page, baslik).getByText("Atananlar: Mehmet Kaya")).toBeAttached();
  });

  test("mobilde görev kişi sayfasından atanır", async ({ page }, testInfo) => {
    test.skip(gorunum(testInfo) !== "mobil", "mobil kişi sayfası");
    const baslik = benzersiz("Atama mobil");
    const id = await yapilacaklar(page, baslik, ["Afiş baskısı"], "web-sitesi-yenileme");
    await ac(page, `/proje/web-sitesi-yenileme/not/${id}`);
    const satir = page.locator('input[data-task-input][value="Afiş baskısı"]');
    await satir.tap();
    await page
      .getByRole("toolbar", { name: "Görev araçları" })
      .getByRole("button", { name: "Kişiye ata" })
      .tap();
    const sayfa = page.getByRole("dialog", { name: "Kişiye ata" });
    await expect(sayfa).toContainText("Afiş baskısı");
    await expect(sayfa.getByRole("option", { name: /Can Yılmaz/ })).toContainText(
      "görüntüleyici · işaretleyemez",
    );
    const yanit = kaydedilsin(page);
    await sayfa.getByRole("option", { name: /Zeynep Arslan/ }).tap();
    await yanit;
    await sayfa.getByRole("button", { name: "Bitti" }).tap();
    await expect(sayfa).toBeHidden();
    await expect(
      page.locator("[data-task-row]", { has: satir }).getByText("Atananlar: Zeynep Arslan"),
    ).toBeAttached();
  });

  test("oluşturan ve son düzenleyen satırı proje notunda görünür", async ({ page }) => {
    await ac(page, "/proje/web-sitesi-yenileme/not/karar-gunlugu");
    await expect(notDiyalogu(page, "Karar günlüğü").getByTestId("not-yazarlari")).toContainText(
      /^Süleyman Kara oluşturdu · Son düzenleyen Süleyman Kara, /,
    );
  });

  test("birleşik arama proje notunu kaynağıyla bulur ve aramanın üstünde açar", async ({
    page,
  }) => {
    const ek = Math.random().toString(36).slice(2, 8);
    const baslik = `Tarama takvimi ${ek}`;
    await metinNotu(page, baslik, "fotograf-arsivi");
    await ac(page, `/ara?q=${encodeURIComponent(`tarama takvimi ${ek}`)}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("için 1 sonuç");
    await expect(page.getByRole("heading", { name: "Fotoğraf Arşivi", level: 2 })).toBeVisible();
    const sonuc = page.getByRole("link", { name: new RegExp(baslik) });
    await expect(sonuc).toContainText("Fotoğraf Arşivi");
    // Kaynak süzgeci: Notlarım'da sonuç yok.
    await page
      .getByRole("navigation", { name: "Kaynak süzgeci" })
      .getByRole("link", { name: "Notlarım" })
      .click();
    await expect(page.getByRole("heading", { name: /için sonuç yok/ })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Kaynak süzgeci" })
      .getByRole("link", { name: "Fotoğraf Arşivi" })
      .click();
    await page.getByRole("link", { name: new RegExp(baslik) }).click();
    await expect(page).toHaveURL(/\/ara\/not\/.+\?q=/);
    const dlg = notDiyalogu(page, baslik);
    await expect(dlg.getByTestId("not-yazarlari")).toContainText("Ayşe Demir oluşturdu");
    await dlg
      .getByRole("button", { name: gorunum(test.info()) === "mobil" ? "Geri" : "Kapat" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/ara\?q=.+kaynak=fotograf-arsivi/);
  });
});

test.describe("görüntüleyici", () => {
  test("proje notunu salt okunur açar; görev işaretleyemez", async ({ browser }) => {
    const durum = await oturum(browser, "can");
    const ctx = await browser.newContext({ storageState: durum });
    const page = await ctx.newPage();
    try {
      await ac(page, "/proje/fotograf-arsivi/not/album-secimi");
      const dlg = notDiyalogu(page, "Albüm seçimi");
      await expect(dlg.getByText("Görüntüleyici", { exact: true })).toBeVisible();
      await expect(dlg.getByRole("note")).toContainText("Salt okunur.");
      await expect(dlg.getByRole("checkbox")).toHaveCount(0);
      await expect(dlg.getByLabel("Not başlığı")).toHaveAttribute("readonly", "");
      await expect(dlg.getByRole("button", { name: "Görev ekle" })).toHaveCount(0);
      await expect(dlg.getByRole("button", { name: "Kopyala…" })).toHaveCount(0);
      await expect(dlg.getByText("Atananlar: Zeynep Arslan")).toBeAttached();
      await expect(dlg).toContainText("Sana atanan görevi de işaretleyemezsin");

      // Sunucu da reddeder.
      const res = await page.request.post("/api/notlar/album-secimi/gorevler", {
        data: { ops: [{ op: "complete", id: "album-secimi-g2" }] },
      });
      expect(res.status()).toBe(403);
    } finally {
      await ctx.close();
    }
  });
});

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, ozet: v.help, ornekler: v.nodes.map((n) => n.target.join(" ")) }));
}

test.describe("erişilebilirlik (axe): proje notu ve arama", () => {
  for (const tema of ["light", "dark"] as const) {
    const ad = tema === "light" ? "açık" : "koyu";
    test(`proje notu ve kişi seçici ${ad} temada ciddi ihlal içermez`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await ac(page, "/proje/web-sitesi-yenileme/not/lansman-hazirligi");
      await expect(notDiyalogu(page, "Lansman hazırlığı")).toBeVisible();
      expect(await ciddiIhlaller(page)).toEqual([]);
      if (!(await dokunmatik(page))) {
        await page.locator('input[data-task-input][value="SEO kontrolleri"]').focus();
        await page.keyboard.press("Control+Shift+A");
        await expect(page.getByRole("listbox")).toBeVisible();
        expect(await ciddiIhlaller(page)).toEqual([]);
      }
    });

    test(`arama sonuçları ${ad} temada ciddi ihlal içermez`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await ac(page, "/ara?q=teklif");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("sonuç");
      expect(await ciddiIhlaller(page)).toEqual([]);
    });
  }
});
