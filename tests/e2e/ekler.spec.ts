import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ac, gorunum, kisiSayfasi } from "./yardimcilar";

/**
 * Dosya ekleri (Aşama 5a) uçtan uca, üç görünümde: metin notuna görsel ekleyip
 * görüntüleyicide açma, genel dosya ekleyip indirme, 10 MB sınırı, görüntüleyici rolünün
 * ekleyememesi, açık ve koyu temada axe. Oturum `ayse@test.sukano`; görüntüleyici Can
 * (Web Sitesi Yenileme).
 */

const WEB = "web-sitesi-yenileme";
const MB = 1024 * 1024;

/** Ekran görüntüleri için yumuşak geçişli küçük bir PNG (bağımlılıksız). */
function gradientPng(width = 320, height = 200): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      raw[i] = 60 + Math.round((x / width) * 120);
      raw[i + 1] = 110 + Math.round((y / height) * 90);
      raw[i + 2] = 90 + Math.round(((x + y) / (width + height)) * 100);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function yeniNot(request: APIRequestContext, title: string, projectId?: string) {
  const id = randomUUID();
  const res = await request.post("/api/notlar", {
    form: {
      intent: "create",
      id,
      title,
      bodyHtml: "<p>Salon için sıcak gri tonları; balkona katlanır masa.</p>",
      color: "turuncu",
      ...(projectId ? { projectId } : {}),
    },
  });
  expect(res.ok()).toBe(true);
  return id;
}

async function ekYukle(
  request: APIRequestContext,
  noteId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  const res = await request.post(`/api/notlar/${noteId}/ekler`, {
    multipart: { dosya: { name, mimeType, buffer } },
  });
  expect(res.status()).toBe(201);
}

async function notuAc(page: Page, path: string, title: string) {
  await ac(page, path);
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

const benzersiz = (ad: string) => `${ad} ${Math.random().toString(36).slice(2, 7)}`;

test.describe("dosya ekleri", () => {
  test(
    "metin notuna görsel eklenir, kartta kapak olur ve görüntüleyicide açılır",
    { tag: "@duman" },
    async ({ page }) => {
      const title = benzersiz("Ev tadilatı");
      const id = await yeniNot(page.request, title);
      const dialog = await notuAc(page, `/not/${id}`, title);
      await dialog.getByTestId("dosya-sec").setInputFiles({
        name: "salon-ölçü.png",
        mimeType: "image/png",
        buffer: gradientPng(),
      });
      const tile = dialog.getByRole("button", { name: "Görseli aç: salon-ölçü.png" });
      await expect(tile).toBeVisible();
      await expect(tile.locator("img")).toHaveJSProperty("complete", true);
      await tile.click();
      const viewer = page.getByRole("dialog", { name: "salon-ölçü.png" });
      await expect(viewer.getByRole("img", { name: "salon-ölçü.png" })).toBeVisible();
      await expect(viewer.getByRole("link", { name: "İndir" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(viewer).toBeHidden();
      await expect(dialog).toBeVisible();
      // Not kapanınca kartta kapak görseli.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      const card = page.locator(`article[data-note-id="${id}"]`);
      await expect(card.locator("img[data-kapak]")).toBeVisible();
    },
  );

  test("genel dosya eklenir, rozet ve boyutla görünür ve indirilir", async ({ page }) => {
    const title = benzersiz("Teklifler");
    const id = await yeniNot(page.request, title);
    const dialog = await notuAc(page, `/not/${id}`, title);
    await dialog.getByTestId("dosya-sec").setInputFiles({
      name: "usta-teklifi-kasim.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Mutfak: 42.000 TL\nBanyo: 18.500 TL\n".repeat(60)),
    });
    const link = dialog.getByRole("link", { name: /^İndir: usta-teklifi-kasim\.txt\s+\d+ KB$/ });
    await expect(link).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Ekler" })).toContainText("TXT");
    const download = page.waitForEvent("download");
    await link.click();
    // (Türkçe ad `filename*` ile gider — Worker testi denetler; testteki Chromium
    // `filename*`'ı çözmediği için burada ASCII ad kullanılır.)
    const file = await download;
    expect(file.suggestedFilename()).toBe("usta-teklifi-kasim.txt");
    expect(readFileSync(await file.path(), "utf8")).toContain("Mutfak: 42.000 TL");
  });

  test("10 MB'yi aşan dosya tasarımdaki hatayla reddedilir ve kaldırılır", async ({ page }) => {
    const title = benzersiz("Video");
    const id = await yeniNot(page.request, title);
    const dialog = await notuAc(page, `/not/${id}`, title);
    await dialog.getByTestId("dosya-sec").setInputFiles({
      name: "balkon-video.mov",
      mimeType: "video/quicktime",
      buffer: Buffer.alloc(11 * MB),
    });
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("balkon-video.mov");
    await expect(alert).toContainText("11 MB · dosya başına en fazla 10 MB");
    await alert.getByRole("button", { name: "Kaldır" }).click();
    await expect(alert).toBeHidden();
  });

  test("eki kaldır: ek nottan ve karttan kalkar", async ({ page }) => {
    const title = benzersiz("Kaldırma");
    const id = await yeniNot(page.request, title);
    await ekYukle(page.request, id, "plan.pdf", "application/pdf", Buffer.alloc(3000, 1));
    const dialog = await notuAc(page, `/not/${id}`, title);
    await dialog.getByRole("button", { name: "Eki kaldır: plan.pdf" }).click();
    await expect(dialog.getByRole("region", { name: "Ekler" })).toBeHidden();
    // Kaldırma iyimserdir: bölge hemen gizlenir, istek ardından gider (yükte yarışıyordu).
    await expect
      .poll(async () => {
        const list = await page.request.get(`/api/notlar/${id}/ekler`);
        return (await list.json()).attachments;
      })
      .toEqual([]);
  });

  test("görüntüleyici ekleri görür ve indirir ama ekleyemez, kaldıramaz", async ({
    page,
    browser,
  }, testInfo) => {
    const title = benzersiz("Marka rehberi");
    const id = await yeniNot(page.request, title, WEB);
    await ekYukle(page.request, id, "logo.png", "image/png", gradientPng(120, 80));
    await ekYukle(page.request, id, "renkler.pdf", "application/pdf", Buffer.alloc(2048, 1));
    const can = await kisiSayfasi(browser, testInfo, "can");
    try {
      const dialog = await notuAc(can, `/proje/${WEB}/not/${id}`, title);
      await expect(dialog.getByText("Görüntüleyici", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Görseli aç: logo.png" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: /^İndir: renkler\.pdf/ })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Dosya ekle" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: /Eki kaldır/ })).toHaveCount(0);
      await expect(dialog.getByTestId("dosya-sec")).toHaveCount(0);
      // Sunucu da reddeder.
      const res = await can.request.post(`/api/notlar/${id}/ekler`, {
        multipart: { dosya: { name: "a.png", mimeType: "image/png", buffer: gradientPng(8, 8) } },
      });
      expect(res.status()).toBe(403);
    } finally {
      await can.context().close();
    }
  });

  for (const tema of ["light", "dark"] as const) {
    test(`ekli açık not ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`, async ({
      page,
    }, testInfo) => {
      const title = benzersiz("Erişilebilir ekler");
      const id = await yeniNot(page.request, title);
      await ekYukle(page.request, id, "salon.png", "image/png", gradientPng());
      await ekYukle(
        page.request,
        id,
        "usta-teklifi-kasim.pdf",
        "application/pdf",
        Buffer.alloc(1.8 * MB, 1),
      );
      await ekYukle(
        page.request,
        id,
        "bütçe.xlsx",
        "application/octet-stream",
        Buffer.alloc(40_000, 1),
      );
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      const dialog = await notuAc(page, `/not/${id}`, title);
      await expect(dialog.getByRole("button", { name: "Görseli aç: salon.png" })).toBeVisible();
      // Yükleme hatası durumu da denetlensin.
      await dialog.getByTestId("dosya-sec").setInputFiles({
        name: "balkon-video.mov",
        mimeType: "video/quicktime",
        buffer: Buffer.alloc(10 * MB + 1),
      });
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const ciddi = violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => ({ kural: v.id, ozet: v.help, ornekler: v.nodes.map((n) => n.target) }));
      expect(ciddi).toEqual([]);
      const shots = process.env.EKLER_EKRAN_DIZINI;
      if (shots) {
        await page.screenshot({ path: `${shots}/not-${gorunum(testInfo)}-${tema}.png` });
        await page.keyboard.press("Escape"); // hata kutucuğu değil, not kapanır
        await page.getByRole("dialog", { name: title }).waitFor({ state: "hidden" });
        await page.locator(`article[data-note-id="${id}"] img[data-kapak]`).waitFor();
        await page.screenshot({ path: `${shots}/izgara-${gorunum(testInfo)}-${tema}.png` });
      }
    });
  }
});
