import { expect, test, type Page } from "@playwright/test";
import { ac, gorunum } from "./yardimcilar";

/**
 * Algılanan hız: tıklama ağ beklemeden görünür tepki verir (açık not önizlemesi, kapanış,
 * kenar çubuğu seçimi), gezinme ve not eylemlerinden sonra kabuk (kök loader) yeniden
 * yüklenmez, bağlantılar üzerine gelince önceden yüklenir, yanıtlar `Server-Timing` taşır.
 */

/** Kendi notunu oluşturur (paralel görünümler birbirinin notuna dokunmaz). */
async function notOlustur(page: Page, onEk: string) {
  const id = crypto.randomUUID();
  const baslik = `${onEk} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const res = await page.request.post("/api/notlar", {
    form: { intent: "create", id, title: baslik, bodyHtml: "<p>önizleme metni</p>" },
  });
  expect(res.ok()).toBe(true);
  return { id, baslik };
}

const kart = (page: Page, id: string) => page.locator(`article[data-note-id="${id}"]`);

/** Kök loader'ı da içeren veri istekleri (`_routes` yoksa ya da `root` içeriyorsa). */
function kabukIstekleri(page: Page) {
  const list: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() !== "GET" || !u.pathname.endsWith(".data")) return;
    const routes = u.searchParams.get("_routes");
    if (!routes || routes.split(",").includes("root")) list.push(u.pathname + u.search);
  });
  return list;
}

test.describe("algılanan hız", () => {
  // İstek geciktirme (`page.route`) service worker'ın yaptığı isteği görmez.
  test.use({ serviceWorkers: "block" });

  test("açık not loader bitmeden kartın verisiyle hemen açılır, sonra düzenleyici gelir", async ({
    page,
  }) => {
    const { id, baslik } = await notOlustur(page, "Önizleme");
    await ac(page, "/");
    // Not verisi geç gelsin: önizleme ağ beklemeden açılmalı.
    let birak: () => void = () => {};
    const bekle = new Promise<void>((r) => (birak = r));
    await page.route(`**/not/${id}.data*`, async (route) => {
      await bekle;
      await route.continue();
    });
    await kart(page, id).locator("a[data-open]").click();
    const onizleme = page.locator("[data-not-onizleme]");
    await expect(onizleme).toBeVisible();
    await expect(onizleme).toHaveAttribute("aria-busy", "true");
    await expect(onizleme).toContainText(baslik);
    await expect(onizleme).toContainText("önizleme metni");
    birak();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Not başlığı")).toHaveValue(baslik);
    await expect(onizleme).toHaveCount(0);
  });

  test("not kapanırken ağ beklenmez; kart açıp kapamak kabuğu ve ızgarayı yüklemez", async ({
    page,
  }) => {
    const { id } = await notOlustur(page, "Kapanış");
    await ac(page, "/");
    const kabuk = kabukIstekleri(page);
    const veri: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.endsWith(".data")) veri.push(r.url());
    });
    await kart(page, id).locator("a[data-open]").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Not başlığı")).toBeVisible();
    // Açılış yalnızca not rotasını yükler.
    const notIstekleri = veri.filter((u) => new URL(u).pathname.includes("/not/"));
    expect(notIstekleri.length).toBeGreaterThan(0);
    expect(notIstekleri.every((u) => new URL(u).searchParams.get("_routes") === "routes/not")).toBe(
      true,
    );
    // Kapanış ağa bağlı değil: bundan sonra hiçbir veri isteği yanıtlanmasa da diyalog hemen
    // kalkar ve adres ızgaraya döner.
    await page.route("**/*.data*", () => {});
    const kapat =
      gorunum(test.info()) === "mobil"
        ? dialog.getByRole("button", { name: "Geri" })
        : dialog.getByRole("button", { name: "Kapat" }).last();
    await kapat.click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(kart(page, id)).toBeVisible();
    await page.waitForTimeout(300);
    expect(kabuk).toEqual([]);
  });

  test("sabitledikten sonra kabuk yeniden yüklenmez, ızgara yüklenir", async ({ page }) => {
    const { id } = await notOlustur(page, "Sabit");
    await ac(page, "/");
    const kabuk = kabukIstekleri(page);
    const izgara = page.waitForRequest((r) => {
      const u = new URL(r.url());
      return u.pathname.endsWith(".data") && u.searchParams.get("_routes") === "routes/home";
    });
    const eylem = page.waitForResponse(
      (r) => r.url().includes("/api/notlar") && r.request().method() === "POST",
    );
    const k = kart(page, id);
    if (gorunum(test.info()) === "masaustu") {
      await k.hover();
      await k.getByRole("button", { name: "Sabitle", exact: true }).click();
    } else {
      await k.getByRole("button", { name: /: işlemler$/ }).click();
      await page
        .getByRole("dialog", { name: /not işlemleri/i })
        .getByRole("menuitem", { name: "Sabitle" })
        .click();
    }
    // İyimser: sunucu yanıtı beklenmeden sabitlenmiş bölümde.
    await expect(
      page.getByRole("list", { name: "Sabitlenmiş notlar" }).locator(`[data-note-id="${id}"]`),
    ).toBeVisible();
    await eylem;
    await izgara;
    await page.waitForTimeout(300);
    expect(kabuk).toEqual([]);
  });

  test("bölüm değişirken tıklanan görünüm veri gelmeden seçili görünür", async ({ page }) => {
    await ac(page, "/");
    let birak: () => void = () => {};
    const bekle = new Promise<void>((r) => (birak = r));
    await page.route("**/arsiv.data*", async (route) => {
      await bekle;
      await route.continue();
    });
    const gorunumler = page.getByRole("navigation", { name: "Görünüm" });
    await gorunumler.getByRole("link", { name: "Arşiv" }).click();
    await expect(gorunumler.getByRole("link", { name: "Arşiv" })).toHaveClass(/text-primary/);
    await expect(page).toHaveURL(/\/$/);
    birak();
    await expect(page).toHaveURL(/\/arsiv$/);
    await expect(gorunumler.getByRole("link", { name: "Arşiv" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("kart ve gezinme bağlantıları üzerine gelince önceden yüklenir", async ({ page }) => {
    test.skip(gorunum(test.info()) !== "masaustu", "Üzerine gelme masaüstünde");
    const { id } = await notOlustur(page, "Önyükleme");
    await ac(page, "/");
    await kart(page, id).locator("a[data-open]").hover();
    await expect(page.locator(`link[rel="prefetch"][href*="/not/${id}.data"]`)).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Görünüm" })
      .getByRole("link", { name: "Arşiv" })
      .hover();
    await expect(page.locator('link[rel="prefetch"][href*="/arsiv.data"]')).toHaveCount(1);
  });

  test("belge ve veri yanıtları Server-Timing taşır", async ({ page }) => {
    const belge = await page.goto("/");
    expect(belge?.headers()["server-timing"]).toMatch(/total;dur=[\d.]+, db;dur=[\d.]+;desc="/);
    const veri = await page.request.get("/_.data?_routes=routes/home");
    expect(veri.headers()["server-timing"]).toMatch(/desc="\d+ sorgu \/ \d+ tur"/);
  });
});
