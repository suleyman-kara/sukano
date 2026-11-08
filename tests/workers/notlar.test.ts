import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { seedDatabase, seedUserId } from "~/db/seed";
import { noteVersions, notes, tasks } from "~/db/schema";
import { VERSION_WINDOW_MS } from "~/domain/notes/versions";
import { NoteNotFoundError, personalNotes, purgeExpiredTrash } from "~/lib/notes.server";
import { purgeTrashedNotes } from "../../workers/scheduled";
import { hesaplar } from "../fixtures/hesaplar";
import { ornekKisiselAlanlar, ornekProjeler } from "../fixtures/ornek-veri";
import { eq } from "drizzle-orm";

const SULEYMAN = seedUserId("suleyman");
const AYSE = seedUserId("ayse");
const DAY = 86_400_000;

let clockNow = new Date("2026-11-07T10:00:00Z");
const clock = () => clockNow;
const svc = (userId = SULEYMAN) => personalNotes(env, userId, clock);
const db = () => createDb(env.DB);
const uuid = () => crypto.randomUUID();

beforeAll(async () => {
  await seedDatabase(env.DB, {
    hesaplar,
    projeler: ornekProjeler,
    kisiselAlanlar: ornekKisiselAlanlar,
  });
});

async function newNote(title: string, bodyHtml = "", userId = SULEYMAN) {
  const id = uuid();
  await svc(userId).create({ id, title, bodyHtml, color: "default", pinned: false });
  return id;
}

describe("not listeleme", () => {
  it("Notlar görünümü yalnızca kullanıcının arşivlenmemiş, çöpte olmayan notlarını konuma göre verir", async () => {
    const list = await svc().list("notlar");
    const ids = list.map((n) => n.id);
    expect(ids).toContain("market");
    expect(ids).not.toContain("eski-alisveris-listesi");
    expect(ids).not.toContain("silinecek-taslak");
    expect(ids).not.toContain("ayse-okuma-listesi");
    expect(ids).not.toContain("lansman-hazirligi");
  });

  it("yapılacaklar kartı ilk 5 tamamlanmamış üst görevi ve kalan sayıyı taşır", async () => {
    const plan = (await svc().list("notlar")).find((n) => n.id === "haftalik-plan")!;
    expect(plan.tasks).toHaveLength(5);
    expect(plan.tasks[0]).toEqual({
      id: "haftalik-plan-g1",
      title: "Spor salonu üyeliğini yenile",
      done: false,
    });
    expect(plan.moreTasks).toBe(3);
  });

  it("metin kartının önizlemesi gövdenin düz metnidir", async () => {
    const note = (await svc().list("notlar")).find((n) => n.id === "wifi-sifresi")!;
    expect(note.preview).toBe("Modemin altındaki etiket, misafirler için ayrı ağ aç.");
  });

  it("arşiv ve çöp görünümleri kendi notlarını verir", async () => {
    expect((await svc().list("arsiv")).map((n) => n.id)).toEqual(["eski-alisveris-listesi"]);
    expect((await svc().list("cop")).map((n) => n.id)).toContain("silinecek-taslak");
  });
});

describe("oluşturma ve güncelleme", () => {
  it("yeni not en üste eklenir ve ilk sürümü kaydedilir", async () => {
    const id = await newNote("Yeni not", "<p>Merhaba <strong>dünya</strong></p>");
    const list = await svc().list("notlar");
    const others = list.filter((n) => !n.pinned);
    expect(others[0]!.id).toBe(id);
    const row = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(row).toMatchObject({
      ownerUserId: SULEYMAN,
      kind: "text",
      bodyText: "Yeni not\nMerhaba dünya",
    });
    expect(await svc().listVersions(id)).toHaveLength(1);
  });

  it("aynı kimlikle ikinci kez oluşturma reddedilir", async () => {
    const id = await newNote("Bir");
    await expect(
      svc(AYSE).create({ id, title: "x", bodyHtml: "", color: "default", pinned: false }),
    ).rejects.toThrow(NoteNotFoundError);
  });

  it("başlık, gövde, renk ve sabitleme güncellenir", async () => {
    const id = await newNote("Eski başlık");
    await svc().update(id, { title: "Yeni başlık", bodyHtml: "<p>Gövde</p>" });
    await svc().setColor(id, "mor");
    await svc().setPinned(id, true);
    const n = await svc().get(id);
    expect(n).toMatchObject({
      title: "Yeni başlık",
      bodyHtml: "<p>Gövde</p>",
      color: "mor",
      pinned: true,
    });
  });
});

describe("sahiplik", () => {
  it("başka kullanıcının notu bulunamadı sayılır (her işlemde)", async () => {
    const other = svc(AYSE);
    // Her deneme sırayla başlatılır: biri beklenirken diğerinin reddi sahipsiz kalmasın.
    const attempts = [
      () => other.get("market"),
      () => other.update("market", { title: "x" }),
      () => other.setColor("market", "mor"),
      () => other.setPinned("market", false),
      () => other.archive("market"),
      () => other.trash("market"),
      () => other.restore("market"),
      () => other.duplicate("market", uuid()),
      () => other.move("market", true, 0),
      () => other.listVersions("market"),
      () => other.deletePermanently("silinecek-taslak"),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toThrow(NoteNotFoundError);
    expect((await svc().get("market")).title).toBe("Market");
  });

  it("proje notu kişisel işlemlerle erişilemez", async () => {
    await expect(svc().get("lansman-hazirligi")).rejects.toThrow(NoteNotFoundError);
  });

  it("oturumsuz /not/:id isteği girişe yönlendirilir", async () => {
    const res = await exports.default.fetch("http://sukano.test/not/market", {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/giris");
  });

  it("oturumsuz /api/notlar eylemi girişe yönlendirilir", async () => {
    const res = await exports.default.fetch("http://sukano.test/api/notlar", {
      method: "POST",
      body: new URLSearchParams({ intent: "trash", id: "market" }),
      redirect: "manual",
    });
    expect([302, 401, 403]).toContain(res.status);
    expect((await svc().get("market")).trashedAt).toBeNull();
  });
});

describe("arşiv, çöp, geri yükleme", () => {
  it("arşivle → arşivden çıkar", async () => {
    const id = await newNote("Arşivlik");
    await svc().archive(id);
    expect((await svc().list("arsiv")).some((n) => n.id === id)).toBe(true);
    expect((await svc().list("notlar")).some((n) => n.id === id)).toBe(false);
    await svc().unarchive(id);
    expect((await svc().list("notlar")).some((n) => n.id === id)).toBe(true);
  });

  it("çöpe at → geri yükle", async () => {
    const id = await newNote("Çöplük");
    await svc().trash(id);
    expect((await svc().list("cop")).some((n) => n.id === id)).toBe(true);
    await svc().restore(id);
    expect((await svc().list("notlar")).some((n) => n.id === id)).toBe(true);
  });

  it("kalıcı silme yalnızca çöpteki notta çalışır ve sürümleri de siler", async () => {
    const id = await newNote("Silinecek", "<p>x</p>");
    await expect(svc().deletePermanently(id)).rejects.toThrow(NoteNotFoundError);
    await svc().trash(id);
    await svc().deletePermanently(id);
    await expect(svc().get(id)).rejects.toThrow(NoteNotFoundError);
    expect(await db().select().from(noteVersions).where(eq(noteVersions.noteId, id))).toEqual([]);
  });

  it("çöpü boşalt yalnızca kullanıcının çöpünü siler", async () => {
    const mine = await newNote("Benim çöpüm");
    const hers = await newNote("Onun çöpü", "", AYSE);
    await svc().trash(mine);
    await svc(AYSE).trash(hers);
    const deleted = await svc().emptyTrash();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await svc().list("cop")).toEqual([]);
    expect((await svc(AYSE).list("cop")).map((n) => n.id)).toEqual([hers]);
  });
});

describe("kopyasını oluştur", () => {
  it("metin notunun kopyası en üste, sabitlenmemiş oluşur; sürüm geçmişi kopyalanmaz", async () => {
    const id = await newNote("Asıl", "<p>İçerik</p>");
    await svc().update(id, { bodyHtml: "<p>İçerik 2</p>" });
    clockNow = new Date(clockNow.getTime() + VERSION_WINDOW_MS + 1);
    await svc().update(id, { bodyHtml: "<p>İçerik 3</p>" });
    await svc().setPinned(id, true);
    const copy = uuid();
    await svc().duplicate(id, copy);
    const c = await svc().get(copy);
    expect(c).toMatchObject({ title: "Asıl", bodyHtml: "<p>İçerik 3</p>", pinned: false });
    expect((await svc().list("notlar")).filter((n) => !n.pinned)[0]!.id).toBe(copy);
    expect(await svc().listVersions(copy)).toHaveLength(1);
  });

  it("yapılacaklar notunun görevleri ağaçla birlikte kopyalanır", async () => {
    const copy = uuid();
    await svc().duplicate("haftalik-plan", copy);
    const copied = await db().select().from(tasks).where(eq(tasks.noteId, copy));
    expect(copied).toHaveLength(8);
  });

  it("kopya kısa süre içinde geri alınabilir (discard), sonra alınamaz", async () => {
    const id = await newNote("Kaynak");
    const copy = uuid();
    await svc().duplicate(id, copy);
    await svc().discard(copy);
    await expect(svc().get(copy)).rejects.toThrow(NoteNotFoundError);

    const late = uuid();
    await svc().duplicate(id, late);
    clockNow = new Date(clockNow.getTime() + 10 * 60 * 1000);
    await expect(svc().discard(late)).rejects.toThrow(NoteNotFoundError);
  });
});

describe("sıralama", () => {
  it("not kendi bölümünde istenen sıraya taşınır", async () => {
    const before = (await svc().list("notlar")).filter((n) => !n.pinned).map((n) => n.id);
    const moving = before[0]!;
    await svc().move(moving, false, 2);
    const after = (await svc().list("notlar")).filter((n) => !n.pinned).map((n) => n.id);
    expect(after.indexOf(moving)).toBe(2);
    expect(after.filter((id) => id !== moving)).toEqual(before.filter((id) => id !== moving));
  });

  it("sabitlenmiş bölümde taşıma diğerlerini etkilemez", async () => {
    const others = (await svc().list("notlar")).filter((n) => !n.pinned).map((n) => n.id);
    const pinned = (await svc().list("notlar")).filter((n) => n.pinned).map((n) => n.id);
    const last = pinned[pinned.length - 1]!;
    await svc().move(last, true, 0);
    const list = await svc().list("notlar");
    expect(list.filter((n) => n.pinned)[0]!.id).toBe(last);
    expect(list.filter((n) => !n.pinned).map((n) => n.id)).toEqual(others);
  });

  it("yanlış bölüm bildirilirse reddedilir", async () => {
    await expect(svc().move("market", false, 0)).rejects.toThrow(NoteNotFoundError);
  });
});

describe("arama", () => {
  it("Türkçe harf ve aksan duyarsız eşleşir", async () => {
    const ids = (q: string) =>
      svc()
        .search(q)
        .then((r) => r.map((x) => x.id));
    expect(await ids("yuruyus")).toContain("yuruyus-rotalari");
    expect(await ids("SILE")).toContain("yuruyus-rotalari");
    expect(await ids("toplanti")).toContain("toplanti-notlari-5-kasim");
    expect(await ids("kis uykusu")).toContain("film-onerileri");
  });

  it("görev başlıklarında da arar ve eşleşen görevi döner", async () => {
    const r = (await svc().search("kedi")).find((x) => x.id === "market")!;
    expect(r).toMatchObject({ inTask: true, text: "Kedi maması" });
  });

  it("arşivdekiler bulunur, çöptekiler ve başkalarının notları bulunmaz", async () => {
    expect((await svc().search("ampul")).map((r) => r.id)).toEqual(["eski-alisveris-listesi"]);
    expect(await svc().search("örnek")).toEqual([]);
    expect((await svc().search("okuma listesi")).map((r) => r.id)).not.toContain(
      "ayse-okuma-listesi",
    );
    expect(await svc().search("   ")).toEqual([]);
  });
});

describe("sürümler", () => {
  it("aynı kişinin 5 dakika içindeki düzenlemeleri tek sürümü günceller", async () => {
    const id = await newNote("S", "<p>1</p>");
    clockNow = new Date(clockNow.getTime() + 60_000);
    await svc().update(id, { bodyHtml: "<p>2</p>" });
    clockNow = new Date(clockNow.getTime() + 60_000);
    await svc().update(id, { bodyHtml: "<p>3</p>" });
    const versions = await svc().listVersions(id);
    expect(versions).toHaveLength(1);
    expect((await svc().getVersion(id, versions[0]!.id)).html).toBe("<p>3</p>");
  });

  it("pencere dolunca yeni sürüm açılır; değişiklik yoksa sürüm yazılmaz", async () => {
    const id = await newNote("S2", "<p>1</p>");
    clockNow = new Date(clockNow.getTime() + VERSION_WINDOW_MS);
    await svc().update(id, { bodyHtml: "<p>2</p>" });
    await svc().update(id, { bodyHtml: "<p>2</p>" });
    expect(await svc().listVersions(id)).toHaveLength(2);
  });

  it("geri yükleme notu eski hale getirir ve yeni sürüm olarak kaydedilir", async () => {
    const id = await newNote("Taslak", "<p>ilk</p>");
    clockNow = new Date(clockNow.getTime() + VERSION_WINDOW_MS);
    await svc().update(id, { title: "Son", bodyHtml: "<p>son</p>" });
    const [current, first] = await svc().listVersions(id);
    expect(current!.current).toBe(true);
    await svc().restoreVersion(id, first!.id);
    const n = await svc().get(id);
    expect(n).toMatchObject({ title: "Taslak", bodyHtml: "<p>ilk</p>" });
    const versions = await svc().listVersions(id);
    expect(versions).toHaveLength(3);
    expect(versions[0]!.authorName).toBe("Süleyman Kara");
  });

  it("en çok 50 sürüm tutulur", async () => {
    const id = await newNote("Çok sürüm", "<p>0</p>");
    for (let i = 1; i <= 52; i++) {
      clockNow = new Date(clockNow.getTime() + VERSION_WINDOW_MS);
      await svc().update(id, { bodyHtml: `<p>${i}</p>` });
    }
    const versions = await svc().listVersions(id);
    expect(versions).toHaveLength(50);
    expect((await svc().getVersion(id, versions[49]!.id)).html).toBe("<p>3</p>");
  });

  it("başka notun sürümü önizlenemez", async () => {
    const a = await newNote("A", "<p>a</p>");
    const b = await newNote("B", "<p>b</p>");
    const [va] = await svc().listVersions(a);
    await expect(svc().getVersion(b, va!.id)).rejects.toThrow(NoteNotFoundError);
  });
});

describe("cron: çöp temizliği", () => {
  it("7 günden eski çöp notları sürümleriyle silinir, yenileri kalır", async () => {
    const old = await newNote("Eski çöp", "<p>x</p>");
    const fresh = await newNote("Yeni çöp");
    const t = new Date("2026-12-01T00:00:00Z");
    await db()
      .update(notes)
      .set({ trashedAt: new Date(t.getTime() - 7 * DAY - 1) })
      .where(eq(notes.id, old));
    await db()
      .update(notes)
      .set({ trashedAt: new Date(t.getTime() - 6 * DAY) })
      .where(eq(notes.id, fresh));
    const deleted = await purgeExpiredTrash(env, t);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await db().select().from(notes).where(eq(notes.id, old))).toEqual([]);
    expect(await db().select().from(noteVersions).where(eq(noteVersions.noteId, old))).toEqual([]);
    expect(await db().select().from(notes).where(eq(notes.id, fresh))).toHaveLength(1);
  });

  it("zamanlanmış iş aynı temizliği yapar", async () => {
    const id = await newNote("Cron çöpü");
    const t = new Date("2027-01-01T00:00:00Z");
    await db()
      .update(notes)
      .set({ trashedAt: new Date(t.getTime() - 8 * DAY) })
      .where(eq(notes.id, id));
    await purgeTrashedNotes(env, t);
    expect(await db().select().from(notes).where(eq(notes.id, id))).toEqual([]);
  });
});
