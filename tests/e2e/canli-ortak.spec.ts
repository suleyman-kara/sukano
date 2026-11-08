import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ac, gorunum, kisiSayfasi } from "./yardimcilar";

/**
 * Aşama 4b: iki tarayıcıda gerçek zamanlı ortak çalışma (PLAN §5, §11). Ayşe (varsayılan
 * oturum, Web Sitesi Yenileme yöneticisi), Mehmet (düzenleyici) ve Can (görüntüleyici)
 * ayrı tarayıcı bağlamlarında aynı proje notunu açar. Her test kendi notunu oluşturur.
 * Üç görünümde koşar (masaüstü, tablet, mobil); görünüme özgü atlamalar yanında yazılı.
 */
const WEB = "web-sitesi-yenileme";

test.describe.configure({ timeout: 60_000 });

const kimlik = () => crypto.randomUUID();
const ek = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function metinNotu(page: Page, baslik: string, govde = "<p>başlangıç</p>") {
  const id = kimlik();
  const res = await page.request.post("/api/notlar", {
    form: { intent: "create", id, projectId: WEB, title: baslik, bodyHtml: govde },
  });
  expect(res.ok()).toBe(true);
  return id;
}

async function yapilacaklarNotu(page: Page, baslik: string, gorevler: string[]) {
  const id = kimlik();
  const res = await page.request.post("/api/notlar", {
    form: {
      intent: "create-todo",
      id,
      projectId: WEB,
      title: baslik,
      color: "default",
      pinned: "false",
      tasks: JSON.stringify(gorevler),
    },
  });
  expect(res.ok()).toBe(true);
  return id;
}

async function eylem(page: Page, form: Record<string, string>) {
  const res = await page.request.post("/api/notlar", { form });
  expect(res.ok()).toBe(true);
}

/** Notu açar, oda bağlantısının kurulmasını bekler; diyaloğu döner. */
async function notuAc(page: Page, id: string): Promise<Locator> {
  await ac(page, `/proje/${WEB}/not/${id}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-canli", "bagli");
  return dialog;
}

const govde = (dialog: Locator) => dialog.getByRole("textbox", { name: "Not", exact: true });
const baslikAlani = (dialog: Locator) => dialog.getByLabel("Not başlığı");

/** Gövde metni (diğerlerinin imleç etiketleri hariç). */
const metin = (dialog: Locator) =>
  govde(dialog).evaluate((el) => {
    const kopya = el.cloneNode(true) as HTMLElement;
    kopya.querySelectorAll(".collab-caret").forEach((c) => c.remove());
    return kopya.textContent;
  });

/** Gövdenin sonuna yazar (metin notu). */
async function sonunaYaz(page: Page, dialog: Locator, metin: string) {
  const g = govde(dialog);
  await expect(g).toHaveAttribute("contenteditable", "true");
  await g.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(metin);
}

test.describe("iki tarayıcıda ortak çalışma", () => {
  test("metinde eşzamanlı yazım iki yönde 1 sn içinde birleşir; varlık avatarı ve imleç görünür, ayrılınca kaybolur", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const id = await metinNotu(page, `Ortak ${ek()}`);
    const ayseNot = await notuAc(page, id);
    const mehmetNot = await notuAc(mehmet, id);

    // Varlık: her biri köşede diğerinin avatarını görür (kendisi listede yok).
    await expect(
      ayseNot.getByRole("button", { name: "Mehmet Kaya bu notu açık tutuyor" }),
    ).toBeVisible();
    await expect(
      mehmetNot.getByRole("button", { name: "Ayşe Demir bu notu açık tutuyor" }),
    ).toBeVisible();
    await expect(ayseNot.getByRole("button", { name: /Ayşe Demir bu notu/ })).toHaveCount(0);

    // Aynı anda iki taraf yazar; ikisi de 1 sn içinde aynı metne ulaşır.
    await Promise.all([sonunaYaz(page, ayseNot, " ayşe"), sonunaYaz(mehmet, mehmetNot, " mehmet")]);
    for (const not of [ayseNot, mehmetNot]) {
      await expect(govde(not)).toContainText("ayşe", { timeout: 1000 });
      await expect(govde(not)).toContainText("mehmet", { timeout: 1000 });
    }
    await expect
      .poll(async () => (await metin(ayseNot)) === (await metin(mehmetNot)), {
        timeout: 1000,
      })
      .toBe(true);

    // Diğerinin imleci adıyla görünür.
    await expect(
      govde(ayseNot).locator(".collab-caret__label", { hasText: "Mehmet Kaya" }),
    ).toBeVisible();

    // Mehmet notu kapatınca Ayşe'nin köşesinden avatarı kalkar.
    await mehmet.context().close();
    await expect(ayseNot.getByTestId("varlik")).toHaveCount(0, { timeout: 5000 });
    await expect(ayseNot).toHaveAttribute("data-canli-kisi", "0");
  });

  test("yapılacaklarda bir tarafta işaretlenen görev diğerinde görünür; odaklanılan görevde kişinin halkası çıkar", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const id = await yapilacaklarNotu(page, `Görevler ${ek()}`, ["Logo dosyaları", "Renk paleti"]);
    const ayseNot = await notuAc(page, id);
    const mehmetNot = await notuAc(mehmet, id);
    await expect(
      ayseNot.getByRole("button", { name: "Mehmet Kaya bu notu açık tutuyor" }),
    ).toBeVisible();

    // Mehmet ikinci göreve odaklanır → Ayşe o satırda Mehmet'in halkasını görür.
    await mehmetNot.locator('[data-task-row] input[aria-label="Görev başlığı"]').nth(1).focus();
    const halka = ayseNot.getByRole("img", { name: "Mehmet Kaya bu görevde" });
    await expect(halka).toBeVisible();
    await expect(
      ayseNot
        .locator("[data-task-row]", {
          has: page.getByRole("img", { name: "Mehmet Kaya bu görevde" }),
        })
        .getByLabel("Görev başlığı"),
    ).toHaveValue("Renk paleti");

    // Mehmet ilk görevi işaretler → Ayşe'de 1 sn içinde "Tamamlananlar (1)" grubuna iner.
    await mehmetNot
      .getByRole("checkbox", { name: "Logo dosyaları tamamlandı olarak işaretle" })
      .check();
    const grup = ayseNot.getByRole("button", { name: /Tamamlananlar \(1\)/ });
    await expect(grup).toBeVisible({ timeout: 1000 });
    await grup.click();
    await expect(
      ayseNot.getByRole("checkbox", { name: "Logo dosyaları tamamlandı olarak işaretle" }),
    ).toBeChecked();
    await mehmet.context().close();
  });

  test("aynı başlığa eşzamanlı yazımda son yazan kazanır, iki taraf aynı başlığı gösterir", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const id = await metinNotu(page, `Başlık ${ek()}`);
    const ayseNot = await notuAc(page, id);
    const mehmetNot = await notuAc(mehmet, id);
    const ayseBaslik = baslikAlani(ayseNot);
    const mehmetBaslik = baslikAlani(mehmetNot);

    await Promise.all([
      ayseBaslik.fill("Ayşe'nin başlığı"),
      mehmetBaslik.fill("Mehmet'in başlığı"),
    ]);
    // Alandan çık (bekleyen başlık kaydı gider, yazarken gelen uzak başlık uygulanır).
    await Promise.all([ayseBaslik.press("Enter"), mehmetBaslik.press("Enter")]);

    // İki taraf aynı başlığı gösterir ve bu, sunucudaki son yazımdır.
    await expect
      .poll(
        async () => {
          const [a, m] = [await ayseBaslik.inputValue(), await mehmetBaslik.inputValue()];
          if (a !== m) return `farklı: ${a} / ${m}`;
          const sunucu = await (await page.request.get(`/proje/${WEB}/not/${id}.data`)).text();
          return sunucu.includes(a) ? a : `sunucuda değil: ${a}`;
        },
        { timeout: 8000 },
      )
      .toMatch(/^(Ayşe'nin başlığı|Mehmet'in başlığı)$/);
    await mehmet.context().close();
  });

  test("görüntüleyici güncellemeleri canlı görür ama düzenleyemez", async ({
    page,
    browser,
  }, testInfo) => {
    const can = await kisiSayfasi(browser, testInfo, "can");
    const id = await metinNotu(page, `Görüntüleyici ${ek()}`);
    const ayseNot = await notuAc(page, id);
    const canNot = await notuAc(can, id);
    await expect(canNot.getByText("Görüntüleyici", { exact: true })).toBeVisible();
    await expect(govde(canNot)).toHaveAttribute("contenteditable", "false");
    await expect(baslikAlani(canNot)).toHaveAttribute("readonly", "");
    // Görüntüleyici de varlıkta görünür.
    await expect(
      ayseNot.getByRole("button", { name: "Can Yılmaz bu notu açık tutuyor" }),
    ).toBeVisible();

    await sonunaYaz(page, ayseNot, " canlı güncelleme");
    await expect(govde(canNot)).toContainText("canlı güncelleme", { timeout: 1000 });
    await expect(govde(canNot)).toHaveAttribute("contenteditable", "false");
    await can.context().close();
  });

  test("çevrimdışı olunca bant çıkar ve düzenleme kapanır; bağlantı gelince yeniden eşitlenir", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const id = await metinNotu(page, `Çevrimdışı ${ek()}`);
    const ayseNot = await notuAc(page, id);
    const mehmetNot = await notuAc(mehmet, id);

    await page.context().setOffline(true);
    const bant = ayseNot.getByTestId("cevrimdisi");
    await expect(bant).toBeVisible();
    await expect(bant).toContainText("Çevrimdışısın.");
    await expect(ayseNot).toHaveAttribute("data-canli", "cevrimdisi");
    await expect(govde(ayseNot)).toHaveAttribute("contenteditable", "false");
    await expect(baslikAlani(ayseNot)).toHaveAttribute("readonly", "");
    await expect(ayseNot.getByTestId("son-esitleme")).toContainText("Son eşitleme: az önce");
    // Kopukken diğerleri listede kalmaz.
    await expect(ayseNot.getByTestId("varlik")).toHaveCount(0);

    // Ayşe kopukken Mehmet yazar.
    await sonunaYaz(mehmet, mehmetNot, " kopukken");
    await page.waitForTimeout(300);
    await expect(govde(ayseNot)).not.toContainText("kopukken");

    await page.context().setOffline(false);
    await expect(ayseNot).toHaveAttribute("data-canli", "bagli", { timeout: 10_000 });
    await expect(bant).toHaveCount(0);
    await expect(govde(ayseNot)).toContainText("kopukken");
    await expect(govde(ayseNot)).toHaveAttribute("contenteditable", "true");
    await mehmet.context().close();
  });

  test("çevrimdışıyken 'Yeniden dene' bağlantı gelince notu yeniden bağlar", async ({ page }) => {
    const id = await metinNotu(page, `Yeniden dene ${ek()}`);
    const not = await notuAc(page, id);
    await page.context().setOffline(true);
    await expect(not.getByTestId("cevrimdisi")).toBeVisible();
    // Bağlantı yokken deneme yine çevrimdışı kalır.
    await not.getByRole("button", { name: "Yeniden dene" }).click();
    await expect(not).toHaveAttribute("data-canli", "cevrimdisi");
    await page.context().setOffline(false);
    await expect(not).toHaveAttribute("data-canli", "bagli", { timeout: 10_000 });
  });

  test("başkası açık notu çöpe atınca not kapanır ve toast kimin yaptığını söyler", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const baslik = `Çöpe gidecek ${ek()}`;
    const id = await metinNotu(page, baslik);
    const mehmetNot = await notuAc(mehmet, id);
    await sonunaYaz(mehmet, mehmetNot, " son söz");

    await eylem(page, { intent: "trash", id });
    await expect(mehmet.getByRole("dialog")).toHaveCount(0);
    await expect(mehmet.getByText("Ayşe Demir bu notu çöpe attı")).toBeVisible();
    await expect(mehmet).toHaveURL(new RegExp(`/proje/${WEB}$`));
    // Yazılan son söz kaybolmadı: not geri yüklenince gövdede.
    await eylem(page, { intent: "restore", id });
    await expect
      .poll(async () =>
        (await (await page.request.get(`/proje/${WEB}/not/${id}.data`)).text()).includes("son söz"),
      )
      .toBe(true);
    await mehmet.context().close();
  });

  test("canlı ızgara: oluşturulan, renklendirilen, sabitlenen ve arşivlenen not diğerinin proje ızgarasında anında değişir", async ({
    page,
    browser,
  }, testInfo) => {
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    await ac(mehmet, `/proje/${WEB}`);
    const baslik = `Izgara ${ek()}`;
    const id = await metinNotu(page, baslik);
    const kart = mehmet.locator(`article[data-note-id="${id}"]`);
    await expect(kart).toBeVisible({ timeout: 5000 });
    await expect(kart).toContainText(baslik);

    await eylem(page, { intent: "color", id, color: "mavi" });
    await expect(kart).toHaveAttribute("data-color", "mavi");

    await eylem(page, { intent: "pin", id, pinned: "true" });
    await expect(
      mehmet
        .getByRole("list", { name: "Sabitlenmiş notlar" })
        .locator(`article[data-note-id="${id}"]`),
    ).toBeVisible();

    await eylem(page, { intent: "archive", id });
    await expect(kart).toHaveCount(0);
    await mehmet.context().close();
  });
});

test.describe("proje kanalı: silme ve çıkarma", () => {
  /** Mehmet yeni bir proje açar, Zeynep'i davet eder, Zeynep kabul eder. */
  async function ortakProje(mehmet: Page, zeynep: Page, ad: string) {
    const olustur = await mehmet.request.post("/api/projeler", {
      form: { intent: "create", name: ad, color: "mavi" },
    });
    expect(olustur.ok()).toBe(true);
    const { id } = (await olustur.json()) as { id: string };
    const davet = await mehmet.request.post(`/api/projeler/${id}`, {
      form: { intent: "invite", email: "zeynep@test.sukano", role: "duzenleyici" },
    });
    expect(davet.ok()).toBe(true);
    const { invitationId } = (await davet.json()) as { invitationId: string };
    const kabul = await zeynep.request.post("/api/davetler", {
      form: { intent: "accept", id: invitationId },
    });
    expect(kabul.ok()).toBe(true);
    return id;
  }

  test("başkası projeyi silince açık not ve proje sayfası kapanır, Notlarım'a dönülür", async ({
    browser,
  }, testInfo) => {
    test.skip(
      gorunum(testInfo) !== "masaustu",
      "Yönlendirme görünümden bağımsız; tek görünüm yeterli",
    );
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const zeynep = await kisiSayfasi(browser, testInfo, "zeynep");
    const ad = `Silinecek ${ek()}`;
    const projeId = await ortakProje(mehmet, zeynep, ad);
    const notId = kimlik();
    const res = await zeynep.request.post("/api/notlar", {
      form: {
        intent: "create",
        id: notId,
        projectId: projeId,
        title: "Taslak",
        bodyHtml: "<p>x</p>",
      },
    });
    expect(res.ok()).toBe(true);
    await ac(zeynep, `/proje/${projeId}/not/${notId}`);
    await expect(zeynep.getByRole("dialog")).toHaveAttribute("data-canli", "bagli");

    const sil = await mehmet.request.post(`/api/projeler/${projeId}`, {
      form: { intent: "delete" },
    });
    expect(sil.ok()).toBe(true);
    await expect(zeynep).toHaveURL((url) => url.pathname === "/");
    await expect(zeynep.getByText(`${ad} silindi`)).toBeVisible();
    await expect(
      zeynep.getByText("Mehmet Kaya bu projeyi sildi. Notlarım'a döndün."),
    ).toBeVisible();
    await mehmet.context().close();
    await zeynep.context().close();
  });

  test("projeden çıkarılan üye Notlarım'a yönlendirilir; rolü düşürülen sayfada kalır", async ({
    browser,
  }, testInfo) => {
    test.skip(
      gorunum(testInfo) !== "masaustu",
      "Yönlendirme görünümden bağımsız; tek görünüm yeterli",
    );
    const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
    const zeynep = await kisiSayfasi(browser, testInfo, "zeynep");
    const projeId = await ortakProje(mehmet, zeynep, `Çıkarma ${ek()}`);
    await ac(zeynep, `/proje/${projeId}`);

    const rol = await mehmet.request.post(`/api/projeler/${projeId}`, {
      form: { intent: "set-role", userId: "user-zeynep", role: "goruntuleyici" },
    });
    expect(rol.ok()).toBe(true);
    await expect(zeynep.getByText("Rolün değişti")).toBeVisible();
    await expect(zeynep).toHaveURL(new RegExp(`/proje/${projeId}$`));

    const cikar = await mehmet.request.post(`/api/projeler/${projeId}`, {
      form: { intent: "remove-member", userId: "user-zeynep" },
    });
    expect(cikar.ok()).toBe(true);
    await expect(zeynep).toHaveURL((url) => url.pathname === "/");
    await expect(zeynep.getByText("Projeden çıkarıldın")).toBeVisible();
    await mehmet.context().close();
    await zeynep.context().close();
  });
});

test.describe("erişilebilirlik: varlık ve çevrimdışı bandı", () => {
  for (const tema of ["light", "dark"] as const) {
    test(`varlık avatarı ve çevrimdışı bandı olan not ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`, async ({
      page,
      browser,
    }, testInfo) => {
      test.skip(gorunum(testInfo) === "tablet", "Masaüstü ve mobil yerleşimleri yeterli");
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      const mehmet = await kisiSayfasi(browser, testInfo, "mehmet");
      await mehmet.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      const id = await metinNotu(page, `Erişilebilir ${ek()}`);
      await notuAc(mehmet, id);
      const not = await notuAc(page, id);
      await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
      await expect(
        not.getByRole("button", { name: "Mehmet Kaya bu notu açık tutuyor" }),
      ).toBeVisible();
      // Önce varlıkla, sonra çevrimdışı bandıyla denetlenir.
      const ihlaller = async () =>
        (
          await new AxeBuilder({ page })
            .include("[role=dialog]")
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations
          .filter((v) => v.impact === "critical" || v.impact === "serious")
          .map((v) => ({ kural: v.id, ozet: v.help, ornekler: v.nodes.map((n) => n.target) }));
      expect(await ihlaller()).toEqual([]);
      await page.context().setOffline(true);
      await expect(not.getByTestId("cevrimdisi")).toBeVisible();
      expect(await ihlaller()).toEqual([]);
      await page.context().setOffline(false);
      await mehmet.context().close();
    });
  }
});
