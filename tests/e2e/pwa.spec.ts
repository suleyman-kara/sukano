import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { hesaplar } from "../fixtures/hesaplar";
import { OTURUMSUZ } from "./ortam";
import { ac, gorunum, type Gorunum } from "./yardimcilar";

/**
 * Aşama 6a: PWA (manifest, service worker, kurulabilirlik, kurulum ipucu), çevrimdışı okuma
 * (önbellekten salt okunur sayfa, oturum yalıtımı), 404 ve çevrimdışı sayfası. Üç görünüm.
 */
test.describe.configure({ timeout: 60_000 });

const EKRAN = process.env.E2E_EKRAN_DIZINI;
const IPUCU_ANAHTARI = "sukano:kurulum-ipucu";
const ek = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function ekranGoruntusu(page: Page, testInfo: TestInfo, ad: string) {
  if (!EKRAN) return;
  mkdirSync(EKRAN, { recursive: true });
  await page.screenshot({ path: `${EKRAN}/${ad}-${testInfo.project.name}.png` });
}

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, etki: v.impact, ozet: v.help, ornekler: v.nodes.length }));
}

/** CSP ihlali konsola düşer; sayfa boyunca toplanır. */
function cspIhlalleri(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) out.push(m.text());
  });
  return out;
}

/** Service worker etkin ve sayfayı denetliyor. */
async function swHazir(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)))
    .toBe(true);
}

/** Adres, oturumun sayfa önbelleğinde mi. */
function sayfaOnbellekte(page: Page, yol: string) {
  return page.evaluate(async (path) => {
    const url = location.origin + path;
    for (const name of await caches.keys()) {
      if (!name.startsWith("sukano-sayfa-")) continue;
      if (await (await caches.open(name)).match(url, { ignoreVary: true })) return true;
    }
    return false;
  }, yol);
}

/** Sayfanın yüklediği derleme dosyalarının hepsi statik önbellekte mi. */
function varliklarOnbellekte(page: Page) {
  return page.evaluate(async () => {
    const cache = await caches.open("sukano-statik-v1");
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => new URL(e.name))
      .filter((u) => u.origin === location.origin && u.pathname.startsWith("/assets/"))
      .map((u) => u.href);
    const missing = [];
    for (const url of urls) if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
    return missing;
  });
}

async function kisiselNot(page: Page, baslik: string) {
  const id = crypto.randomUUID();
  const res = await page.request.post("/api/notlar", {
    form: { intent: "create", id, title: baslik, bodyHtml: "<p>çevrimdışı okunacak gövde</p>" },
  });
  expect(res.ok()).toBe(true);
  return id;
}

test.describe("PWA", () => {
  test(
    "manifest bağlı, service worker kayıtlı ve uygulama kurulabilir; CSP ihlali yok",
    { tag: "@duman" },
    async ({ page }) => {
      const ihlaller = cspIhlalleri(page);
      await ac(page, "/");
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        "href",
        "/manifest.webmanifest",
      );
      const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as {
        name: string;
        display: string;
        start_url: string;
        icons: { sizes: string; purpose: string }[];
      };
      expect(manifest.name).toBe("Sukano");
      expect(manifest.display).toBe("standalone");
      expect(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(
        true,
      );
      for (const yol of ["/icons/icon-192.png", "/icons/icon-512.png", "/apple-touch-icon.png"]) {
        expect((await page.request.get(yol)).headers()["content-type"]).toBe("image/png");
      }

      await swHazir(page);
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

      // Chromium'un kendi kurulabilirlik denetimi (manifest + simgeler + service worker).
      const cdp = await page.context().newCDPSession(page);
      const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as {
        installabilityErrors: { errorId: string }[];
      };
      expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
      expect(ihlaller).toEqual([]);
    },
  );

  test("çevrimiçi açılan not çevrimdışıyken yeniden yüklenince önbellekten salt okunur açılır", async ({
    page,
  }, testInfo) => {
    const baslik = `Çevrimdışı okuma ${ek()}`;
    const id = await kisiselNot(page, baslik);
    await ac(page, `/not/${id}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("data-canli", "bagli");
    await swHazir(page);
    await expect.poll(() => sayfaOnbellekte(page, `/not/${id}`), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => varliklarOnbellekte(page), { timeout: 15_000 }).toEqual([]);

    await page.context().setOffline(true);
    try {
      const res = await page.reload();
      expect(res?.fromServiceWorker()).toBe(true);
      const not = page.getByRole("dialog");
      await expect(not.getByLabel("Not başlığı")).toHaveValue(baslik);
      await expect(not.getByTestId("cevrimdisi")).toBeVisible();
      await expect(not.getByTestId("cevrimdisi")).toContainText("Çevrimdışısın.");
      // Düzenleme kapalı.
      await expect(not.getByLabel("Not başlığı")).toHaveAttribute("readonly", "");
      await expect(not.getByRole("textbox", { name: "Not", exact: true })).toHaveAttribute(
        "contenteditable",
        "false",
      );
      await ekranGoruntusu(page, testInfo, "cevrimdisi-not");

      // Not kapanınca ızgara ekranda kalır (çevrimdışıyken yeniden doğrulama yok); sayfa
      // bandı çıkar, "Not al" etkileşimsiz.
      await not
        .getByRole("button", { name: /Kapat|Geri/ })
        .first()
        .click();
      await expect(page.getByRole("heading", { name: "Notlarım", level: 1 })).toBeVisible();
      await expect(page.getByRole("article", { name: baslik })).toBeVisible();
      await expect(page.getByTestId("cevrimdisi").first()).toBeVisible();
      await ekranGoruntusu(page, testInfo, "cevrimdisi-izgara");

      for (const tema of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
        expect(await ciddiIhlaller(page)).toEqual([]);
      }
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("çevrimdışıyken önbellekte olmayan sayfa çevrimdışı sayfasını gösterir", async ({
    page,
  }, testInfo) => {
    await ac(page, "/");
    await swHazir(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.context().setOffline(true);
    try {
      await page.goto(`/hic-acilmamis-${ek()}`);
      await expect(page.getByRole("heading", { name: "Çevrimdışısın" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Notlarıma dön" })).toBeVisible();
      await ekranGoruntusu(page, testInfo, "cevrimdisi-sayfasi");
      for (const tema of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: tema });
        expect(await ciddiIhlaller(page)).toEqual([]);
      }
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("çevrimdışıyken uygulama içi gezinme: açılmış sayfa önbellekten gelir, açılmamış sayfa hata vermez", async ({
    page,
  }, testInfo) => {
    await ac(page, "/davetler");
    await swHazir(page);
    await expect.poll(() => sayfaOnbellekte(page, "/davetler"), { timeout: 15_000 }).toBe(true);
    await ac(page, "/");
    await expect.poll(() => varliklarOnbellekte(page), { timeout: 15_000 }).toEqual([]);
    await page.context().setOffline(true);
    const git = async (ad: RegExp) => {
      const link = page.getByRole("link", { name: ad }).first();
      if (!(await link.isVisible()))
        await page.getByRole("button", { name: "Gezinme menüsü" }).click();
      await link.click();
    };
    try {
      // Daha önce açılan sayfa: verisi önbellekte değilse belge önbellekten yeniden yüklenir.
      await git(/^Davetler/);
      await expect(page.getByRole("heading", { name: "Davetler", level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      // Hiç açılmamış sayfa: çevrimdışı görünümü (ayrıntılı hata değil).
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500); // önbellekten yeniden yüklenen sayfanın hidrasyonu
      if (gorunum(testInfo) === "mobil") await page.goto("/ayarlar");
      else await git(/^Ayarlar$/);
      // Rota parçası önbellekte yoksa React Router sayfayı yeniden yükler (önbellekteki
      // açık sayfa kalır); belge isteğinde çevrimdışı sayfası gelir. Genel hata görünmez.
      await page.waitForTimeout(1500);
      await expect(
        page
          .getByRole("heading", { name: "Bu sayfa çevrimdışı açılamıyor" })
          .or(page.getByRole("heading", { name: "Çevrimdışısın" }))
          .or(page.getByRole("heading", { name: "Davetler", level: 1 })),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Bir şeyler ters gitti" })).toHaveCount(0);
      await ekranGoruntusu(page, testInfo, "cevrimdisi-gezinme");
      for (const tema of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
        expect(await ciddiIhlaller(page)).toEqual([]);
      }
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("404 sayfası açık ve koyu temada erişilebilir", async ({ page }, testInfo) => {
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      const res = await page.goto(`/bu-sayfa-yok-${ek()}`);
      expect(res?.status()).toBe(404);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
      await expect(
        page.getByRole("heading", { name: "Bu sayfa yok ya da erişimin kaldırılmış" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Notlarıma dön" })).toBeVisible();
      if (tema === "light") await ekranGoruntusu(page, testInfo, "404");
      expect(await ciddiIhlaller(page)).toEqual([]);
    }
  });
});

/** Çıkış testi her görünümde ayrı kişiyle (oturumu kapatılan kişi diğer testleri bozmasın). */
const CIKAN: Record<Gorunum, "mehmet" | "can" | "zeynep"> = {
  masaustu: "mehmet",
  tablet: "can",
  mobil: "zeynep",
};

async function girisYap(browser: Browser, testInfo: TestInfo, kisi: keyof typeof hesaplar) {
  const context = await browser.newContext({ ...testInfo.project.use, storageState: OTURUMSUZ });
  const page = await context.newPage();
  await page.goto("/giris");
  await page.waitForLoadState("networkidle");
  await page.evaluate((k) => localStorage.setItem(k, String(Date.now())), IPUCU_ANAHTARI);
  await page.locator("#eposta").fill(hesaplar[kisi].eposta);
  await page.locator("#sifre").fill(hesaplar[kisi].sifre);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  return page;
}

test("çıkış yapınca oturumun sayfa önbellekleri silinir", async ({ browser }, testInfo) => {
  const page = await girisYap(browser, testInfo, CIKAN[gorunum(testInfo)]);
  try {
    await page.waitForLoadState("networkidle");
    await swHazir(page);
    await expect.poll(() => sayfaOnbellekte(page, "/"), { timeout: 15_000 }).toBe(true);

    await page.evaluate(() => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/cikis";
      document.body.appendChild(form);
      form.submit();
    });
    await page.waitForURL((url) => url.pathname === "/giris");
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await caches.keys()).filter((n) => n.startsWith("sukano-sayfa-")),
        ),
      )
      .toEqual([]);

    // Çevrimdışıyken eski oturumun sayfası artık gösterilmez.
    await page.context().setOffline(true);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Çevrimdışısın" })).toBeVisible();
  } finally {
    await page.context().close();
  }
});

test.describe("kurulum ipucu", () => {
  test("Android ve masaüstünde tarayıcı önerince 'Ekle' kurulum penceresini açar", async ({
    page,
  }, testInfo) => {
    await ac(page, "/");
    await page.evaluate((k) => localStorage.removeItem(k), IPUCU_ANAHTARI);
    await ac(page, "/");
    const ipucu = page.getByTestId("kurulum-ipucu");
    // Öneri gelmeden (Chromium, iOS değil) ipucu yok.
    await page.waitForTimeout(3000);
    await expect(ipucu).toHaveCount(0);

    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      e.prompt = () => {
        (window as unknown as { __kuruldu: boolean }).__kuruldu = true;
        return Promise.resolve();
      };
      e.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(e);
    });
    await expect(ipucu).toBeVisible();
    await expect(ipucu).toContainText("Sukano'yu ana ekrana ekle");
    await expect(ipucu).toContainText(
      "Uygulama gibi açılır, hatırlatıcılar bildirim olarak gelir.",
    );
    await ekranGoruntusu(page, testInfo, "kurulum-ipucu");
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      expect(await ciddiIhlaller(page)).toEqual([]);
    }
    await ipucu.getByRole("button", { name: "Ekle" }).click();
    await expect(ipucu).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __kuruldu?: boolean }).__kuruldu),
    ).toBe(true);
    // Kabul edildi: bir daha gösterilmez.
    expect(await page.evaluate((k) => localStorage.getItem(k), IPUCU_ANAHTARI)).not.toBeNull();
  });

  test("'Şimdi değil' ya da kapatınca ipucu yeniden yüklemede gösterilmez", async ({
    page,
  }, testInfo) => {
    await ac(page, "/");
    await page.evaluate((k) => localStorage.removeItem(k), IPUCU_ANAHTARI);
    await ac(page, "/");
    const oner = () =>
      page.evaluate(() => {
        const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        };
        e.prompt = () => Promise.resolve();
        e.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(e);
      });
    await oner();
    const ipucu = page.getByTestId("kurulum-ipucu");
    await expect(ipucu).toBeVisible();
    const kapat =
      gorunum(testInfo) === "mobil"
        ? ipucu.getByRole("button", { name: "Şimdi değil" })
        : ipucu.getByRole("button", { name: "Kapat" });
    await kapat.click();
    await expect(ipucu).toHaveCount(0);
    await ac(page, "/");
    await oner();
    await page.waitForTimeout(3000);
    await expect(ipucu).toHaveCount(0);
  });

  test("iPhone Safari'de Paylaş → Ana Ekrana Ekle adımları gösterilir", async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      ...testInfo.project.use,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    try {
      await ac(page, "/");
      await page.evaluate((k) => localStorage.removeItem(k), IPUCU_ANAHTARI);
      await ac(page, "/");
      const ipucu = page.getByTestId("kurulum-ipucu");
      await expect(ipucu).toBeVisible();
      await expect(ipucu).toContainText(
        "iPhone'da hatırlatıcı bildirimleri yalnızca ana ekrana eklenen uygulamada gelir.",
      );
      await expect(ipucu.getByRole("listitem")).toHaveCount(3);
      await expect(ipucu).toContainText("Ana Ekrana Ekle");
      await expect(ipucu.getByRole("button", { name: "Ekle" })).toHaveCount(0);
      await ekranGoruntusu(page, testInfo, "kurulum-ipucu-ios");
      for (const tema of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
        expect(await ciddiIhlaller(page)).toEqual([]);
      }
      await ipucu.getByRole("button", { name: "Şimdi değil" }).click();
      await expect(ipucu).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
