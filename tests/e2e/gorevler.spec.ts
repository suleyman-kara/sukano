import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ac, gorunum } from "./yardimcilar";

/**
 * Yapılacaklar notu (Aşama 2) uçtan uca, üç görünümde. Oturum: `ayse@test.sukano`
 * (playwright.config.ts varsayılanı). Her test kendi notunu benzersiz başlıkla oluşturur.
 */

const benzersiz = (ad: string) => `${ad} ${Math.random().toString(36).slice(2, 8)}`;
const dokunmatik = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

type Gorev = { baslik: string; tamam?: boolean; alt?: Gorev[] };

/** API ile yapılacaklar notu ve görev ağacı oluşturur; not kimliğini ve görev kimliklerini döner. */
async function yapilacaklar(page: Page, baslik: string, gorevler: Gorev[] = []) {
  const id = randomUUID();
  const res = await page.request.post("/api/notlar", {
    form: {
      intent: "create-todo",
      id,
      title: baslik,
      color: "default",
      pinned: "false",
      tasks: "[]",
    },
  });
  expect(res.ok()).toBe(true);
  const kimlik: Record<string, string> = {};
  const ops: unknown[] = [];
  const ekle = (liste: Gorev[], parentId: string | null) =>
    liste.forEach((g, i) => {
      const gid = randomUUID();
      kimlik[g.baslik] = gid;
      ops.push({
        op: "create",
        id: gid,
        parentId,
        position: i,
        title: g.baslik,
        completed: !!g.tamam,
      });
      ekle(g.alt ?? [], gid);
    });
  ekle(gorevler, null);
  if (ops.length) {
    const r = await page.request.post(`/api/notlar/${id}/gorevler`, { data: { ops } });
    expect(r.ok()).toBe(true);
  }
  return { id, kimlik };
}

const satir = (page: Page, baslik: string) =>
  page.locator(`input[data-task-input][value="${baslik}"]`);

/** Görünür satırlar: "derinlik:başlık". */
const satirlar = (page: Page) =>
  page
    .locator("[data-task-row]")
    .evaluateAll((rows) =>
      rows.map(
        (r) =>
          `${(r as HTMLElement).dataset.depth}:${r.querySelector<HTMLInputElement>("[data-task-input]")!.value}`,
      ),
    );

/** Görev işlemleri sunucuya ulaşana kadar bekler. */
const kaydedilsin = (page: Page) =>
  page.waitForResponse(
    (r) => /\/gorevler$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
  );

async function odakla(page: Page, baslik: string) {
  const input = satir(page, baslik);
  if (await dokunmatik(page)) await input.tap();
  else await input.click();
  await input.press("End");
}

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, ozet: v.help, ornekler: v.nodes.map((n) => n.target.join(" ")) }));
}

/** Not içi "Diğer" menüsünden bir komut (masaüstü/tablet açılır menü, mobil alttan sayfa). */
async function digerMenu(page: Page, komut: string) {
  await page.getByRole("dialog").getByRole("button", { name: "Diğer" }).click();
  await page.getByRole("menuitem", { name: komut }).click();
}

test.describe("yapılacaklar notu", () => {
  test(
    "not al alanından oluşturulur; yalnızca klavyeyle 3 seviyeli liste kurulur, tarih verilir",
    { tag: "@duman" },
    async ({ page }) => {
      await ac(page, "/");
      const baslik = benzersiz("Taşınma");
      if (gorunum(test.info()) === "mobil") {
        await page.getByRole("button", { name: "Yeni not oluştur" }).click();
        await page.getByRole("menuitem", { name: "Yapılacaklar notu" }).click();
      } else {
        await page.getByRole("button", { name: "Yeni yapılacaklar notu" }).click();
      }
      const form = page.getByRole("form", { name: "Yeni yapılacaklar notu" });
      await form.getByLabel("Not başlığı").fill(baslik);
      await form.getByLabel("Not başlığı").press("Enter");
      await page.keyboard.type("Kolileri hazırla");
      const olustu = page.waitForResponse(
        (r) =>
          /\/api\/notlar(\.data)?$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Kapat" }).click();
      await olustu;
      await page.waitForLoadState("networkidle");
      const kart = page
        .locator("article[data-note-id]")
        .filter({ has: page.getByRole("heading", { name: baslik }) });
      await expect(kart).toContainText("Kolileri hazırla");
      const href = await kart.getByRole("link").first().getAttribute("href");
      await ac(page, href!);
      await expect(page.getByRole("dialog")).toBeVisible();

      // Klavye: Enter → yeni görev, Tab → alt görev (iki kez → 3. seviye).
      await satir(page, "Kolileri hazırla").focus();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-task-input]:focus")).toHaveAttribute(
        "placeholder",
        "Görev yaz · Enter yeni görev · Tab alt görev",
      );
      await page.keyboard.type("Mutfak");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Tabaklar");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Bardaklar");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter"); // boş alt görevde Enter girintiyi azaltır
      await page.keyboard.type("Tencereler");
      await expect
        .poll(() => satirlar(page))
        .toEqual(["0:Kolileri hazırla", "1:Mutfak", "2:Tabaklar", "2:Bardaklar", "1:Tencereler"]);

      // Ctrl+D: odak doğal yazım alanında; bitişte Enter seçiciyi kapatıp satıra döner.
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(satir(page, "Tabaklar")).toBeFocused();
      await page.keyboard.press("ControlOrMeta+d");
      await expect(page.getByRole("textbox", { name: "Bitiş tarihini yaz" })).toBeFocused();
      await page.keyboard.type("15 aralık");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "Bitiş tarihini yaz" })).toBeHidden();
      await expect(satir(page, "Tabaklar")).toBeFocused();
      await expect(
        page.locator("[data-task-row]", { has: satir(page, "Tabaklar") }).first(),
      ).toContainText("15 Ara");

      // Esc: listeden çık → "Görev ekle"; ikinci Esc notu kapatır.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Görev ekle" })).toBeFocused();
      await page.waitForLoadState("networkidle");

      // Yeniden yüklemede ağaç ve aç/kapa durumu korunur.
      await page.reload();
      await expect
        .poll(() => satirlar(page))
        .toEqual(["0:Kolileri hazırla", "1:Mutfak", "2:Tabaklar", "2:Bardaklar", "1:Tencereler"]);
      await page.getByRole("button", { name: "Görev ekle" }).focus();
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/$/);
    },
  );

  test("tamamla → zincir → toast → Geri al ve Ctrl+Z", { tag: "@duman" }, async ({ page }) => {
    const baslik = benzersiz("Zincir");
    await yapilacaklar(page, baslik, [
      { baslik: "Tasarım onayı", alt: [{ baslik: "Ürün sayfası" }, { baslik: "Mobil görünüm" }] },
      { baslik: "SEO kontrolleri" },
    ]);
    await ac(page, "/");
    await page
      .locator("article[data-note-id]")
      .filter({ has: page.getByRole("heading", { name: baslik }) })
      .getByRole("link")
      .first()
      .click();
    await page.getByRole("button", { name: "Alt görevleri aç veya kapat" }).first().click();
    await expect(satir(page, "Mobil görünüm")).toBeVisible();

    await odakla(page, "Ürün sayfası");
    let kayit = kaydedilsin(page);
    await page.keyboard.press("ControlOrMeta+Enter");
    await kayit;
    await expect(satir(page, "Mobil görünüm")).toBeFocused();
    kayit = kaydedilsin(page);
    await page.keyboard.press("ControlOrMeta+Enter");
    await kayit;
    const toastlar = page.locator("[data-todo-toast]");
    await expect(toastlar).toHaveCount(2);
    await expect(toastlar.first()).toContainText("Tasarım onayı da tamamlandı");
    await expect(toastlar.nth(1)).toContainText("Ürün sayfası tamamlandı");
    // 1,2 sn sonra satırlar "Tamamlananlar" grubuna iner.
    await expect(satir(page, "Tasarım onayı")).toBeHidden();
    await expect(page.getByRole("button", { name: "Tamamlananlar (1)" })).toBeVisible();

    kayit = kaydedilsin(page);
    await toastlar
      .first()
      .getByRole("button", { name: /^Geri al/ })
      .click();
    await kayit;
    await expect(satir(page, "Mobil görünüm")).toBeVisible();
    await expect(satir(page, "Tasarım onayı")).toBeVisible();
    await expect(toastlar).toHaveCount(1);

    // Ctrl+Z (odak satırda) kalan tamamlamayı geri alır.
    kayit = kaydedilsin(page);
    await page.keyboard.press("ControlOrMeta+z");
    await kayit;
    await expect(satir(page, "Ürün sayfası")).toBeVisible();
    await expect(toastlar).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Alt görevleri aç veya kapat" }).first().waitFor();
    await expect(page.getByRole("button", { name: /Tamamlananlar/ })).toHaveCount(0);
  });

  test("tamamlananları sil → geri al", async ({ page }) => {
    const { id } = await yapilacaklar(page, benzersiz("Temizlik"), [
      { baslik: "Açık iş" },
      { baslik: "Bitti bir", tamam: true },
      { baslik: "Bitti iki", tamam: true, alt: [{ baslik: "Alt bitti", tamam: true }] },
    ]);
    await ac(page, `/not/${id}`);
    await expect(page.getByRole("button", { name: "Tamamlananlar (2)" })).toBeVisible();
    let kayit = kaydedilsin(page);
    await digerMenu(page, "Tamamlananları sil");
    await kayit;
    await expect(page.getByRole("button", { name: /Tamamlananlar/ })).toHaveCount(0);
    const toast = page
      .locator("[data-todo-toast]")
      .filter({ hasText: "3 tamamlanan görev silindi" });
    kayit = kaydedilsin(page);
    await toast.getByRole("button", { name: /^Geri al/ }).click();
    await kayit;
    await expect(page.getByRole("button", { name: "Tamamlananlar (2)" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Tamamlananlar (2)" })).toBeVisible();
  });

  test("sürükleyerek alt görev yapılır (masaüstü)", async ({ page }) => {
    test.skip(gorunum(test.info()) !== "masaustu", "Sürükleme fareyle, masaüstünde");
    const { id } = await yapilacaklar(page, benzersiz("Sürükle"), [
      { baslik: "Ana görev" },
      { baslik: "Taşınacak" },
    ]);
    await ac(page, `/not/${id}`);
    const row = page.locator("[data-task-row]").filter({ has: satir(page, "Taşınacak") });
    await row.hover();
    const tutamak = row.locator("[data-drag-handle]");
    const kutu = (await tutamak.boundingBox())!;
    await page.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2);
    await page.mouse.down();
    await page.mouse.move(kutu.x + 10, kutu.y + 2, { steps: 4 });
    await page.mouse.move(kutu.x + 60, kutu.y + 2, { steps: 8 });
    const kayit = kaydedilsin(page);
    await page.mouse.up();
    await kayit;
    await expect.poll(() => satirlar(page)).toEqual(["0:Ana görev", "1:Taşınacak"]);
    await page.reload();
    await expect.poll(() => satirlar(page)).toEqual(["0:Ana görev", "1:Taşınacak"]);
  });

  test("dokunmatik araç çubuğuyla girinti ve tamamlama", async ({ page }) => {
    test.skip(gorunum(test.info()) === "masaustu", "Klavye üstü araç çubuğu dokunmatikte");
    const { id } = await yapilacaklar(page, benzersiz("Araç çubuğu"), [
      { baslik: "Birinci" },
      { baslik: "İkinci" },
    ]);
    await ac(page, `/not/${id}`);
    await satir(page, "İkinci").tap();
    const arac = page.getByRole("toolbar", { name: "Görev araçları" });
    await expect(arac).toBeVisible();
    let kayit = kaydedilsin(page);
    await arac.getByRole("button", { name: "Alt görev yap" }).tap();
    await kayit;
    await expect.poll(() => satirlar(page)).toEqual(["0:Birinci", "1:İkinci"]);
    await expect(satir(page, "İkinci")).toBeFocused();
    kayit = kaydedilsin(page);
    await arac.getByRole("button", { name: "Girintiyi azalt" }).tap();
    await kayit;
    await expect.poll(() => satirlar(page)).toEqual(["0:Birinci", "0:İkinci"]);
    kayit = kaydedilsin(page);
    await arac.getByRole("button", { name: "Görevi tamamla: İkinci" }).tap();
    await kayit;
    await expect(page.locator("[data-todo-toast]")).toContainText("İkinci tamamlandı");
    await arac.getByRole("button", { name: /^Bitti/ }).tap();
    await expect(arac).toBeHidden();
    await expect(page.getByRole("button", { name: "Tamamlananlar (1)" })).toBeVisible();
  });

  test("metin ↔ yapılacaklar dönüşümü onaylıdır", async ({ page }) => {
    const id = randomUUID();
    const baslik = benzersiz("Dönüşüm");
    await page.request.post("/api/notlar", {
      form: {
        intent: "create",
        id,
        title: baslik,
        bodyHtml: "<p>Süt</p><ul><li><p>Ekmek</p></li></ul>",
        color: "default",
        pinned: "false",
      },
    });
    await ac(page, `/not/${id}`);
    // Tasarım v2: dönüştürme her görünümde ⋯ menüsünde.
    await digerMenu(page, "Yapılacaklar notuna dönüştür");
    const onay = page.getByRole("alertdialog", { name: "Yapılacaklar notuna dönüştürülsün mü?" });
    await onay.getByRole("button", { name: "Dönüştür" }).click();
    await expect.poll(() => satirlar(page)).toEqual(["0:Süt", "0:Ekmek"]);

    await digerMenu(page, "Metin notuna dönüştür");
    await page
      .getByRole("alertdialog", { name: "Metin notuna dönüştürülsün mü?" })
      .getByRole("button", { name: "Metne dönüştür" })
      .click();
    const govde = page.getByRole("dialog").getByRole("textbox", { name: "Not", exact: true });
    await expect(govde).toContainText("Süt");
    await expect(govde).toContainText("Ekmek");
    await expect(page.locator("[data-task-row]")).toHaveCount(0);
  });

  test(
    "karttan görev işaretlenir; toast'taki Geri al geri getirir",
    { tag: "@duman" },
    async ({ page }) => {
      const baslik = benzersiz("Kart");
      await yapilacaklar(page, baslik, [{ baslik: "Süt al" }, { baslik: "Ekmek al" }]);
      await ac(page, "/");
      const kart = page
        .locator("article[data-note-id]")
        .filter({ has: page.getByRole("heading", { name: baslik }) });
      const kutu = kart.getByRole("checkbox", { name: "Süt al tamamlandı olarak işaretle" });
      let kayit = kaydedilsin(page);
      if (await dokunmatik(page)) await kutu.tap();
      else await kutu.click();
      await kayit;
      await expect(kart).not.toContainText("Süt al");
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Süt al tamamlandı" });
      kayit = kaydedilsin(page);
      await toast.getByRole("button", { name: "Geri al" }).click();
      await kayit;
      await expect(kart).toContainText("Süt al");
      await page.reload();
      await expect(kart).toContainText("Süt al");
    },
  );

  for (const tema of ["light", "dark"] as const) {
    test(
      `açık yapılacaklar notu (${tema === "light" ? "açık" : "koyu"} tema) kritik ya da ciddi erişilebilirlik ihlali içermez`,
      { tag: tema === "light" ? "@duman" : undefined },
      async ({ page }) => {
        await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
        const { id } = await yapilacaklar(page, benzersiz("Erişilebilir"), [
          { baslik: "Ana", alt: [{ baslik: "Alt", tamam: true }, { baslik: "Diğer alt" }] },
          { baslik: "Tek" },
        ]);
        await ac(page, `/not/${id}`);
        await page.getByRole("button", { name: "Alt görevleri aç veya kapat" }).first().click();
        await odakla(page, "Tek");
        if (!(await dokunmatik(page))) {
          await page.keyboard.press("Shift+Enter");
          await expect(page.getByRole("group", { name: "Tek: ayrıntılar" })).toBeVisible();
        }
        expect(await ciddiIhlaller(page)).toEqual([]);
        await odakla(page, "Ana");
        await page.keyboard.press("ControlOrMeta+d");
        await expect(page.getByRole("dialog", { name: "Tarih" })).toBeVisible();
        expect(await ciddiIhlaller(page)).toEqual([]);
      },
    );
  }
});
