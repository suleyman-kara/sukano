import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { AUTH_STATES } from "./ortam";
import { ac, gorunum, type Gorunum } from "./yardimcilar";

/**
 * Aşama 5b: hatırlatıcılar ve bildirimler (üç görünüm). Her görünüm ayrı kişilerle koşar
 * (bildirimler kişiye özel; paralel projeler birbirinin rozetini bozmasın).
 */
test.describe.configure({ mode: "serial", timeout: 60_000 });

const KISI: Record<
  Gorunum,
  { alan: "ayse" | "mehmet" | "zeynep"; atayan: "ayse" | "mehmet" | "zeynep" }
> = {
  masaustu: { alan: "ayse", atayan: "mehmet" },
  tablet: { alan: "mehmet", atayan: "zeynep" },
  mobil: { alan: "zeynep", atayan: "ayse" },
};
const WEB = "web-sitesi-yenileme";
const ek = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Kişinin oturumuyla, görünüm ayarları ve İstanbul saat dilimiyle ayrı bağlam. */
async function kisiSayfasi(browser: Browser, testInfo: TestInfo, kisi: keyof typeof AUTH_STATES) {
  const context = await browser.newContext({
    ...testInfo.project.use,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    storageState: AUTH_STATES[kisi],
  });
  return context.newPage();
}

function kisiler(testInfo: TestInfo) {
  return KISI[gorunum(testInfo)];
}

/** İstanbul'da yarının tarihi (YYYY-MM-DD). */
function yarin(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(
    new Date(),
  );
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function kisiselNot(page: Page, baslik: string) {
  const id = crypto.randomUUID();
  const res = await page.request.post("/api/notlar", {
    form: { intent: "create", id, title: baslik, bodyHtml: "<p>hatırlatıcı denemesi</p>" },
  });
  expect(res.ok()).toBe(true);
  return id;
}

/** Sahte saatle cron'un hatırlatıcı işini çalıştırır (`/__test/cron`, yalnızca yerel). */
async function cron(page: Page, now: string) {
  const res = await page.request.post(`/__test/cron?now=${encodeURIComponent(now)}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as { claimed: number; notified: number };
}

/** Zil (masaüstü/tablet düğmesi, mobilde bağlantı). */
const zil = (page: Page, mobil: boolean) =>
  mobil
    ? page.getByRole("link", { name: /^Bildirimler/ })
    : page.getByRole("button", { name: /^Bildirimler/ });

/** Bildirim listesini açar: masaüstü ve tablette panel, mobilde /bildirimler. */
async function listeyiAc(page: Page, mobil: boolean) {
  await zil(page, mobil).click();
  if (mobil) {
    await expect(page).toHaveURL(/\/bildirimler$/);
    await expect(page.getByRole("heading", { name: "Bildirimler", level: 1 })).toBeVisible();
    return page.locator("main");
  }
  const panel = page.getByRole("dialog", { name: "Bildirimler" });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("hatırlatıcı ve bildirimler", () => {
  test("not hatırlatıcısı kurulur, sahte saatle cron çalışınca zilde canlı görünür, tümü okundu sayılır", async ({
    browser,
  }, testInfo) => {
    const mobil = gorunum(testInfo) === "mobil";
    const { alan } = kisiler(testInfo);
    const page = await kisiSayfasi(browser, testInfo, alan);
    const baslik = `Hatırlat ${ek()}`;
    const id = await kisiselNot(page, baslik);

    await ac(page, `/not/${id}`);
    const dialog = page.getByRole("dialog", { name: baslik });
    await dialog.getByRole("button", { name: "Not hatırlatıcısı" }).click();
    const secici = page.getByRole("dialog", { name: "Hatırlatıcı" });
    await expect(secici).toBeVisible();
    await expect(
      secici.getByText("Bir kez çalar. Saat dilimi: İstanbul (tarayıcıdan)."),
    ).toBeVisible();
    await secici.getByRole("button", { name: /^Yarın/ }).click();
    await secici.getByRole("button", { name: "Kaydet" }).click();
    await expect(secici).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Hatırlatıcı: Yarın, 09:00" })).toBeVisible();

    // Kartta çip.
    await dialog
      .getByRole("button", { name: mobil ? "Geri" : "Kapat" })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    const kart = page.locator(`article[data-note-id="${id}"]`);
    await expect(kart.getByRole("img", { name: "Hatırlatıcı: Yarın, 09:00" })).toBeVisible();

    // Zamanından önce çalmaz; zamanı gelince bir kez çalar.
    await cron(page, `${yarin()}T05:59:00Z`);
    await expect(page.getByText(`Hatırlatıcı: ${baslik}`)).toHaveCount(0);
    const sonuc = await cron(page, `${yarin()}T06:00:30Z`);
    expect(sonuc.notified).toBeGreaterThanOrEqual(1);

    // Sayfa yenilenmeden (kişisel kanal) rozet çıkar.
    await expect(zil(page, mobil)).toHaveAccessibleName(/^Bildirimler, \d+ yeni$/);
    const liste = await listeyiAc(page, mobil);
    const satir = liste.getByRole("link", { name: new RegExp(`Hatırlatıcı: ${baslik}`) });
    await expect(satir).toBeVisible();
    await expect(satir).toContainText("Kişisel not");
    await expect(satir).toContainText("Notu aç");
    await expect(satir).toContainText("Okunmadı");

    const tumu = liste.getByRole("button", { name: "Tümünü okundu say" }).first();
    await tumu.click();
    await expect(satir).not.toContainText("Okunmadı");
    await expect(tumu).toBeDisabled();
    if (!mobil) await expect(zil(page, mobil)).toHaveAccessibleName("Bildirimler");

    // Bildirim notu açar; hatırlatıcı gönderildiği için çip kalkar.
    await satir.click();
    await expect(page.getByRole("dialog", { name: baslik })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Hatırlatıcı: / })).toHaveCount(0);
    await page.context().close();
  });

  test("göreve atanan kişi bildirimi canlı alır", async ({ browser }, testInfo) => {
    const mobil = gorunum(testInfo) === "mobil";
    const { alan, atayan } = kisiler(testInfo);
    const page = await kisiSayfasi(browser, testInfo, alan);
    const diger = await kisiSayfasi(browser, testInfo, atayan);
    await ac(page, "/");

    const notId = crypto.randomUUID();
    const gorev = `Ürün görseli ${ek()}`;
    const res = await diger.request.post("/api/notlar", {
      form: {
        intent: "create-todo",
        id: notId,
        projectId: WEB,
        title: "Atama denemesi",
        color: "default",
        pinned: "false",
        tasks: JSON.stringify([gorev]),
      },
    });
    expect(res.ok()).toBe(true);
    const { tasks } = (await (await diger.request.get(`/api/notlar/${notId}/gorevler`)).json()) as {
      tasks: { id: string }[];
    };
    const atama = await diger.request.post(`/api/notlar/${notId}/gorevler`, {
      data: { ops: [{ op: "assign", id: tasks[0]!.id, userIds: [`user-${alan}`] }] },
    });
    expect(atama.ok()).toBe(true);

    await expect(zil(page, mobil)).toHaveAccessibleName(/^Bildirimler, \d+ yeni$/);
    const liste = await listeyiAc(page, mobil);
    const satir = liste.getByRole("link", {
      name: new RegExp(`${hesaplar[atayan].ad} seni "${gorev}" görevine atadı`),
    });
    await expect(satir).toBeVisible();
    await expect(satir).toContainText("Web Sitesi Yenileme · Atama denemesi");
    await satir.click();
    await expect(page).toHaveURL(new RegExp(`/proje/${WEB}/not/${notId}$`));
    await diger.context().close();
    await page.context().close();
  });

  test("görevde Hatırlat bitiş tarihi verilince açılır ve kime gittiğini söyler", async ({
    browser,
  }, testInfo) => {
    const { alan } = kisiler(testInfo);
    const page = await kisiSayfasi(browser, testInfo, alan);
    const notId = crypto.randomUUID();
    const gorev = `Fatura ${ek()}`;
    await page.request.post("/api/notlar", {
      form: {
        intent: "create-todo",
        id: notId,
        title: "Görev hatırlatıcısı",
        color: "default",
        pinned: "false",
        tasks: JSON.stringify([gorev]),
      },
    });
    const { tasks } = (await (await page.request.get(`/api/notlar/${notId}/gorevler`)).json()) as {
      tasks: { id: string }[];
    };
    await page.request.post(`/api/notlar/${notId}/gorevler`, {
      data: { ops: [{ op: "update", id: tasks[0]!.id, dueDate: yarin() }] },
    });
    // Tarih seçicide (Ctrl+D) Hatırlat: kişisel notta "Sana gider".
    await ac(page, `/not/${notId}`);
    const satir = page.locator(`input[data-task-input][value="${gorev}"]`);
    if (gorunum(testInfo) === "masaustu") await satir.click();
    else await satir.tap();
    await page.keyboard.press("ControlOrMeta+d");
    const anahtar = page.getByRole("switch", { name: "Hatırlat" });
    await expect(anahtar).toBeEnabled();
    await expect(anahtar).toHaveAccessibleDescription("Sana gider");
    await anahtar.click();
    await expect(anahtar).toBeChecked();
    await page.waitForLoadState("networkidle");
    // Yeniden yüklemede açık kalır.
    await page.reload();
    await page.waitForLoadState("networkidle");
    if (gorunum(testInfo) === "masaustu") await satir.click();
    else await satir.tap();
    await page.keyboard.press("ControlOrMeta+d");
    await expect(page.getByRole("switch", { name: "Hatırlat" })).toBeChecked();
    await page.context().close();
  });
});

test.describe("erişilebilirlik: bildirim paneli ve ayarlar", () => {
  for (const tema of ["light", "dark"] as const) {
    test(`zil paneli / bildirimler sayfası ve Ayarlar → Bildirimler ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`, async ({
      browser,
    }, testInfo) => {
      const mobil = gorunum(testInfo) === "mobil";
      const page = await kisiSayfasi(browser, testInfo, kisiler(testInfo).alan);
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await ac(page, "/");
      await listeyiAc(page, mobil);
      expect(await ciddiIhlaller(page)).toEqual([]);
      await ac(page, "/ayarlar#bildirim");
      await expect(page.getByRole("switch", { name: "Davet e-postası" })).toBeVisible();
      expect(await ciddiIhlaller(page)).toEqual([]);
      await page.context().close();
    });
  }
});

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, etki: v.impact, ozet: v.help, ornekler: v.nodes.length }));
}
