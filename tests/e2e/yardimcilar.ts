import { expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { AUTH_STATES } from "./ortam";

export type Gorunum = "masaustu" | "tablet" | "mobil";

export function gorunum(testInfo: TestInfo): Gorunum {
  return testInfo.project.name as Gorunum;
}

/**
 * Sayfayı açar ve React'in hidrasyonu bitene kadar bekler: sunucuda çizilen
 * düğmeler hidrasyondan önce tıklamaya tepki vermez.
 */
export async function ac(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
}

/**
 * Turnstile betiğini sahte bir sürümle değiştirir: widget görünmez, formdaki
 * `cf-turnstile-response` alanına test jetonunu yazar. Sunucudaki test gizli
 * anahtarı bu jetonu kabul eder. Testler dış ağa (challenges.cloudflare.com)
 * bağımlı olmaz.
 */
export async function sahteTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, o) {
          const i = document.createElement("input");
          i.type = "hidden";
          i.name = o["response-field-name"] || "cf-turnstile-response";
          i.value = "XXXX.DUMMY.TOKEN.XXXX";
          el.appendChild(i);
          return "sahte-" + Math.random();
        },
        reset() {},
        remove() {},
      };`,
    }),
  );
}

type Ileti = { to: string; subject: string; kind: string; url: string };

/** Yerel posta kutusundaki (`/__test/outbox`) son iletinin bağlantısı (yol + sorgu). */
export async function epostaBaglantisi(page: Page, eposta: string, tur: string): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const res = await page.request.get(`/__test/outbox?to=${encodeURIComponent(eposta)}`);
      const list = (await res.json()) as Ileti[];
      link = list.filter((m) => m.kind === tur).at(-1)?.url ?? "";
      return link;
    })
    .not.toBe("");
  const url = new URL(link);
  return url.pathname + url.search;
}

/** Testler arasında çakışmayan e-posta adresi. */
export function yeniEposta(onEk: string, testInfo: TestInfo): string {
  return `${onEk}-${testInfo.project.name}-${Date.now().toString(36)}@ornek.test`;
}

/**
 * İki tarayıcılı testler: başka bir kişinin oturumuyla, aynı görünüm ayarlarında
 * (viewport, dokunmatik, dil) ayrı bir tarayıcı bağlamı açar. Bağlamı test kapatır.
 */
export async function kisiSayfasi(
  browser: Browser,
  testInfo: TestInfo,
  kisi: keyof typeof AUTH_STATES,
): Promise<Page> {
  const context = await browser.newContext({
    ...testInfo.project.use,
    storageState: AUTH_STATES[kisi],
  });
  return context.newPage();
}

/**
 * Öğenin kutusu iki ardışık okumada aynı olana kadar bekler (ızgara kartları Motion
 * `layout` ile yeni yerlerine kayarken ölçülmesin; sürüklemeden önce).
 */
export async function kararliKutu(locator: Locator) {
  let onceki = "";
  await expect
    .poll(
      async () => {
        const kutu = JSON.stringify(await locator.boundingBox());
        const ayni = kutu === onceki;
        onceki = kutu;
        return ayni;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return (await locator.boundingBox())!;
}

/**
 * Gezinmeyi açan düğme: masaüstü ve tablette sol üstteki logo ("Menüyü aç" / "Menüyü kapat"),
 * mobilde üst çubuktaki hamburger ("Gezinme menüsü").
 */
export function menuDugmesi(page: Page): Locator {
  return page
    .getByRole("button", { name: /^(Gezinme menüsü|Menüyü aç|Menüyü kapat)$/ })
    .filter({ visible: true })
    .first();
}
