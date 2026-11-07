import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { desc, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { notes, noteVersions } from "~/db/schema";
import { NOTE_FRAGMENT } from "~/domain/realtime/note-doc";
import type { NoteServerMessage, TaskBroadcast } from "~/domain/realtime/protocol";
import { noteAccess } from "~/lib/note-access.server";
import { verifiedUser } from "./kimlik-yardimcilar";
import { joinNote, type LiveClient, sleep, upgrade } from "./canli-yardimcilar";
import { cookies, form, ID, ops, seed, uuid, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
type Who = "suleyman" | "mehmet" | "can";
let jar: Record<Who | "yabanci", string>;
const open: LiveClient<unknown>[] = [];

beforeAll(async () => {
  await seed();
  const c = await cookies("suleyman", "mehmet", "can");
  jar = { ...c, yabanci: (await verifiedUser()).cookie };
});

afterEach(() => {
  open.splice(0).forEach((c) => c.close());
});

async function join(noteId: string, who: Who) {
  const c = await joinNote(noteId, jar[who]);
  open.push(c as LiveClient<unknown>);
  return c;
}

async function textNote(html = "<p>gövde</p>", title = "Ortak not") {
  const id = uuid();
  const { notes: svc } = await noteAccess(env, ID.suleyman).forProject(WEB);
  await svc.create({ id, title, bodyHtml: html, color: "default", pinned: false });
  return id;
}

async function todoNote() {
  const id = uuid();
  const { tasks } = await noteAccess(env, ID.suleyman).forProject(WEB);
  await tasks.createTodo({ id, title: "Liste", color: "default", pinned: false, tasks: ["Bir"] });
  const state = await tasks.state(id);
  return { id, taskId: state.tasks[0]!.id };
}

const row = (id: string) => db().select().from(notes).where(eq(notes.id, id)).get();
const room = (id: string) => env.NOTE_ROOM.getByName(id);

describe("bağlantı yetkisi", () => {
  it("WebSocket olmayan istek 426", async () => {
    const id = await textNote();
    const { exports } = await import("cloudflare:workers");
    const plain = await exports.default.fetch(`http://sukano.test/api/notlar/${id}/canli`, {
      headers: { cookie: jar.suleyman },
    });
    expect(plain.status).toBe(426);
  });

  it("oturumsuz bağlantı 401", async () => {
    const id = await textNote();
    expect((await upgrade(`/api/notlar/${id}/canli`)).status).toBe(401);
    expect((await upgrade(`/api/kanal/proje/${WEB}`)).status).toBe(401);
    expect((await upgrade(`/api/kanal/kisisel`)).status).toBe(401);
  });

  it("başka kökenden (Origin) bağlantı 403", async () => {
    const id = await textNote();
    const r = await upgrade(`/api/notlar/${id}/canli`, jar.suleyman, {
      origin: "https://kotu.example",
    });
    expect(r.status).toBe(403);
  });

  it("üye olmayan ve başkasının kişisel notu 404; olmayan not 404; çöpteki not 404", async () => {
    const id = await textNote();
    expect((await upgrade(`/api/notlar/${id}/canli`, jar.yabanci)).status).toBe(404);
    expect((await upgrade(`/api/kanal/proje/${WEB}`, jar.yabanci)).status).toBe(404);
    const personal = uuid();
    await noteAccess(env, ID.mehmet).run({
      intent: "create",
      id: personal,
      title: "özel",
      bodyHtml: "",
      color: "default",
      pinned: false,
    });
    expect((await upgrade(`/api/notlar/${personal}/canli`, jar.suleyman)).status).toBe(404);
    expect((await upgrade(`/api/notlar/yok-boyle-not/canli`, jar.suleyman)).status).toBe(404);
    await form("/api/notlar", { intent: "trash", id }, jar.suleyman);
    expect((await upgrade(`/api/notlar/${id}/canli`, jar.suleyman)).status).toBe(404);
  });

  it("üye (görüntüleyici dahil) bağlanır; görüntüleyici salt okunur karşılanır", async () => {
    const id = await textNote();
    const editor = await join(id, "mehmet");
    const viewer = await join(id, "can");
    expect(editor.json[0]).toMatchObject({ t: "hosgeldin", kind: "text", readOnly: false });
    expect(viewer.json[0]).toMatchObject({
      t: "hosgeldin",
      readOnly: true,
      user: { id: ID.can },
    });
    expect(viewer.html).toBe("<p>gövde</p>");
  });
});

describe("metin notu: ortak düzenleme", () => {
  it("bir bağlantının düzenlemesi diğerlerine yayınlanır", async () => {
    const id = await textNote("<p>orta</p>");
    const a = await join(id, "suleyman");
    const b = await join(id, "mehmet");
    const v = await join(id, "can");
    a.type("baş ");
    await b.until(() => b.html === "<p>baş orta</p>", 3000, "b güncellendi");
    await v.until(() => v.html === "<p>baş orta</p>", 3000, "görüntüleyici güncellendi");
    b.type(" son", 8);
    await a.until(() => a.html === "<p>baş orta son</p>", 3000, "a güncellendi");
  });

  it("görüntüleyicinin düzenlemesi uygulanmaz ve yayınlanmaz", async () => {
    const id = await textNote("<p>sabit</p>");
    const editor = await join(id, "mehmet");
    const viewer = await join(id, "can");
    viewer.type("SIZINTI ");
    const warn = await viewer.waitFor((m) => m.t === "hata");
    expect(warn).toMatchObject({ code: "salt_okunur" });
    await sleep(100);
    expect(editor.html).toBe("<p>sabit</p>");
    // Yeni bağlanan da sunucudaki (değişmemiş) belgeyi alır.
    const fresh = await join(id, "suleyman");
    expect(fresh.html).toBe("<p>sabit</p>");
    expect(await runDurableObjectAlarm(room(id))).toBe(false);
  });

  it("varlık: kullanıcı bilgisi sunucuda oturumdakiyle değiştirilir; ayrılınca silinir", async () => {
    const id = await textNote();
    const a = await join(id, "suleyman");
    const b = await join(id, "mehmet");
    b.sendAwareness([
      { clientID: 77, clock: 1, state: { user: { id: ID.suleyman, name: "Sahte" }, focus: null } },
    ]);
    await a.until(() => a.awareness.has(77), 3000, "varlık geldi");
    expect(a.awareness.get(77)).toMatchObject({ user: { id: ID.mehmet } });
    // Sonradan bağlanan mevcut varlığı alır.
    const c = await join(id, "can");
    await c.until(() => c.awareness.has(77), 3000, "anlık görüntü");
    b.close();
    await a.until(() => !a.awareness.has(77), 3000, "ayrılma");
  });

  it("D1 kopyası gecikmeli yazılır (alarm): gövde, son düzenleyen, sürüm", async () => {
    const id = await textNote("<p>ilk</p>", "Rapor");
    const a = await join(id, "mehmet");
    a.type("yeni ");
    await sleep(150);
    // Henüz yazılmadı (debounce).
    expect((await row(id))!.bodyHtml).toBe("<p>ilk</p>");
    const alarm = await runInDurableObject(room(id), (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    expect(alarm! - Date.now()).toBeLessThanOrEqual(5000);
    expect(await runDurableObjectAlarm(room(id))).toBe(true);
    const r = (await row(id))!;
    expect(r.bodyHtml).toBe("<p>yeni ilk</p>");
    expect(r.bodyText).toBe("Rapor\nyeni ilk");
    expect(r.updatedBy).toBe(ID.mehmet);
    const versions = await db()
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, id))
      .orderBy(desc(noteVersions.createdAt));
    expect(versions[0]).toMatchObject({ authorId: ID.mehmet });
    expect((versions[0]!.snapshot as { html: string }).html).toBe("<p>yeni ilk</p>");
    expect(await a.waitFor((m) => m.t === "kaydedildi")).toBeTruthy();
  });

  it("sürüm kuralı: aynı pencerede düzenleyen sahibin sürümü güncellenir", async () => {
    const id = await textNote("<p>x</p>");
    const a = await join(id, "mehmet");
    const b = await join(id, "suleyman");
    a.type("1");
    await sleep(100);
    await runDurableObjectAlarm(room(id));
    const count = async () =>
      (await db().select().from(noteVersions).where(eq(noteVersions.noteId, id))).length;
    // Oluşturmadaki sürüm (Süleyman) + Mehmet'in sürümü.
    expect(await count()).toBe(2);
    // İkisi birlikte yazıyor: son sürüm Mehmet'in, Mehmet de düzenleyenlerde → güncellenir.
    a.type("2");
    b.type("3");
    await b.until(() => b.html.includes("2"), 3000, "eşitleme");
    await sleep(100);
    await runDurableObjectAlarm(room(id));
    expect(await count()).toBe(2);
    expect((await row(id))!.updatedBy).toBe(ID.suleyman);
  });

  it("son bağlantı kapanınca bekleyen değişiklik hemen yazılır", async () => {
    const id = await textNote("<p>son</p>");
    const a = await join(id, "mehmet");
    a.type("en ");
    await sleep(100);
    a.close();
    await sleep(100);
    const alarm = await runInDurableObject(room(id), (_i, state) => state.storage.getAlarm());
    expect(alarm! - Date.now()).toBeLessThanOrEqual(50);
    await runDurableObjectAlarm(room(id));
    expect((await row(id))!.bodyHtml).toBe("<p>en son</p>");
  });

  it("kaydet iletisi bekleyen değişikliği hemen yazar", async () => {
    const id = await textNote("<p>k</p>");
    const a = await join(id, "mehmet");
    a.type("ş");
    await sleep(100);
    a.send(JSON.stringify({ t: "kaydet" }));
    await a.waitFor((m) => m.t === "kaydedildi");
    expect((await row(id))!.bodyHtml).toBe("<p>şk</p>");
  });

  it("durum tahliyeden (uyku) sonra depodan geri gelir", async () => {
    const id = await textNote("<p>kalıcı</p>");
    const a = await join(id, "mehmet");
    a.type("çok ");
    await sleep(150);
    await evictDurableObject(room(id), { webSockets: "close" });
    // D1'e henüz yazılmadı ama yeni bağlantı düzenlemeyi görür.
    expect((await row(id))!.bodyHtml).toBe("<p>kalıcı</p>");
    const b = await join(id, "suleyman");
    expect(b.html).toBe("<p>çok kalıcı</p>");
    const stored = await runInDurableObject(room(id), (_i, state) =>
      state.storage.sql.exec("SELECT count(*) AS n FROM updates").one(),
    );
    expect(Number(stored.n)).toBeGreaterThan(0);
  });

  it("uyuyan bağlantılar uyanınca da yayın alır", async () => {
    const id = await textNote("<p>u</p>");
    const a = await join(id, "mehmet");
    const b = await join(id, "suleyman");
    await evictDurableObject(room(id));
    a.type("y");
    await b.until(() => b.html === "<p>yu</p>", 3000, "uyanınca yayın");
  });

  it("HTTP ile başlık değişince açık bağlantılara bildirilir", async () => {
    const id = await textNote();
    const a = await join(id, "mehmet");
    await form("/api/notlar", { intent: "update", id, title: "Yeni başlık" }, jar.suleyman);
    expect(await a.waitFor((m) => m.t === "not")).toMatchObject({
      title: "Yeni başlık",
      by: ID.suleyman,
    });
    await form("/api/notlar", { intent: "color", id, color: "mavi" }, jar.suleyman);
    expect(await a.waitFor((m) => m.t === "not" && "color" in m)).toMatchObject({ color: "mavi" });
  });

  it("sürüm geri yükleme belgeyi sıfırlar: bağlantı kapanır, yeniden bağlanan D1'den alır", async () => {
    const id = await textNote("<p>v1</p>");
    const a = await join(id, "mehmet");
    a.type("x");
    await sleep(100);
    await runDurableObjectAlarm(room(id));
    const versions = await db()
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, id))
      .orderBy(noteVersions.createdAt);
    const docId = (a.json[0] as Extract<NoteServerMessage, { t: "hosgeldin" }>).docId;
    await form(
      "/api/notlar",
      { intent: "restore-version", id, versionId: versions[0]!.id },
      jar.suleyman,
    );
    await a.waitFor((m) => m.t === "sifirla");
    await a.until(() => a.closed !== null, 3000, "kapanış");
    expect(a.closed!.code).toBe(4009);
    const b = await join(id, "mehmet");
    expect(b.html).toBe("<p>v1</p>");
    expect((b.json[0] as { docId: string }).docId).not.toBe(docId);
  });

  it("D1 gövdesi oda dışında değiştiyse yazım ezmez, oda sıfırlanır", async () => {
    const id = await textNote("<p>a</p>");
    const a = await join(id, "mehmet");
    a.type("b");
    await sleep(100);
    await db().update(notes).set({ bodyHtml: "<p>dışarıdan</p>" }).where(eq(notes.id, id));
    await runDurableObjectAlarm(room(id));
    expect((await row(id))!.bodyHtml).toBe("<p>dışarıdan</p>");
    await a.until(() => a.closed !== null, 3000, "sıfırlama");
  });

  it("not kalıcı silinince bağlantılar 4404 ile kapanır", async () => {
    const id = await textNote();
    const a = await join(id, "mehmet");
    await form("/api/notlar", { intent: "trash", id }, jar.suleyman);
    await a.waitFor((m) => m.t === "not" && "trashed" in m);
    await form("/api/notlar", { intent: "delete", id }, jar.suleyman);
    await a.until(() => a.closed !== null, 3000, "kapanış");
    expect(a.closed!.code).toBe(4404);
  });
});

describe("yapılacaklar: görev işlemleri odadan geçer", () => {
  it("işlem sonucu tüm bağlantılara sıra numarasıyla yayınlanır; HTTP yanıtı aynı seq'i taşır", async () => {
    const { id, taskId } = await todoNote();
    const a = await join(id, "suleyman");
    const v = await join(id, "can");
    expect(a.json[0]).toMatchObject({ t: "hosgeldin", kind: "todo" });
    const res = await ops(id, [{ op: "update", id: taskId, title: "Güncel" }], jar.mehmet);
    expect(res.status).toBe(200);
    expect(res.body.seq).toBe(1);
    const msg = (await v.waitFor((m) => m.t === "gorevler")) as TaskBroadcast;
    expect(msg).toMatchObject({ seq: 1, by: ID.mehmet });
    expect(msg.tasks[0]!.title).toBe("Güncel");
    await a.waitFor((m) => m.t === "gorevler");
  });

  it("eşzamanlı başlık düzenlemeleri tek sıraya dizilir; son yazan (sunucu sırası) kazanır", async () => {
    const { id, taskId } = await todoNote();
    const a = await join(id, "suleyman");
    const [r1, r2, r3] = await Promise.all([
      ops(id, [{ op: "update", id: taskId, title: "Mehmet" }], jar.mehmet),
      ops(id, [{ op: "update", id: taskId, title: "Süleyman" }], jar.suleyman),
      ops(
        id,
        [{ op: "create", id: uuid(), parentId: null, position: 9, title: "Yeni" }],
        jar.mehmet,
      ),
    ]);
    const results = [r1, r2, r3].map(
      (r) => r.body as { seq: number; tasks: { id: string; title: string }[] },
    );
    expect(new Set(results.map((r) => r.seq))).toEqual(new Set([1, 2, 3]));
    await a.until(() => a.json.filter((m) => m.t === "gorevler").length === 3, 3000, "üç yayın");
    const broadcasts = a.json.filter((m): m is TaskBroadcast => m.t === "gorevler");
    expect(broadcasts.map((b) => b.seq)).toEqual([1, 2, 3]);
    const titleOf = (r: { tasks: { id: string; title: string }[] }) =>
      r.tasks.find((t) => t.id === taskId)!.title;
    // Sıradaki son başlık yazımı kazanır; son yayın ve D1 aynı sonucu gösterir.
    const titleWrites = [
      { seq: (r1.body as { seq: number }).seq, title: "Mehmet" },
      { seq: (r2.body as { seq: number }).seq, title: "Süleyman" },
    ].sort((x, y) => x.seq - y.seq);
    expect(titleOf(broadcasts[2]!)).toBe(titleWrites[1]!.title);
    const { tasks } = await noteAccess(env, ID.suleyman).forNote(id);
    expect((await tasks.state(id)).tasks.find((t) => t.id === taskId)!.title).toBe(
      titleWrites[1]!.title,
    );
  });

  it("görüntüleyicinin görev işlemi 403, yabancı 404; hiçbir şey yayınlanmaz", async () => {
    const { id, taskId } = await todoNote();
    const a = await join(id, "suleyman");
    expect((await ops(id, [{ op: "complete", id: taskId }], jar.can)).status).toBe(403);
    expect((await ops(id, [{ op: "complete", id: taskId }], jar.yabanci)).status).toBe(404);
    expect((await ops(id, [{ op: "complete", id: "yok" }], jar.mehmet)).status).toBe(409);
    await sleep(100);
    expect(a.json.some((m) => m.t === "gorevler")).toBe(false);
  });

  it("yapılacaklar notunda Yjs düzenlemesi kabul edilmez", async () => {
    const { id } = await todoNote();
    const a = await join(id, "mehmet");
    const para = a.doc.getXmlFragment(NOTE_FRAGMENT);
    para.insert(0, [new (await import("yjs")).XmlElement("paragraph")]);
    expect(await a.waitFor((m) => m.t === "hata")).toMatchObject({ code: "salt_okunur" });
  });
});
