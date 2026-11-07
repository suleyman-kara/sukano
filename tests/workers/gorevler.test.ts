import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { seedDatabase, seedUserId } from "~/db/seed";
import { attachments, noteVersions, notes, tasks } from "~/db/schema";
import type { TodoSnapshot } from "~/domain/tasks/convert";
import type { Task } from "~/domain/tasks/model";
import { TaskOpError, type TaskOp } from "~/domain/tasks/ops";
import { indent, insertAfter, moveTo, outdent } from "~/domain/tasks/tree";
import { VERSION_WINDOW_MS } from "~/domain/notes/versions";
import { NoteConflictError } from "~/lib/note-store.server";
import { NoteNotFoundError, personalNotes } from "~/lib/notes.server";
import { personalTasks } from "~/lib/tasks.server";
import { hesaplar } from "../fixtures/hesaplar";
import { ornekKisiselAlanlar, ornekProjeler } from "../fixtures/ornek-veri";
import { exports } from "cloudflare:workers";
import { ORIGIN, get, postForm, postJson, verifiedUser } from "./kimlik-yardimcilar";

const SULEYMAN = seedUserId("suleyman");
const AYSE = seedUserId("ayse");

let clockNow = new Date("2026-11-07T10:00:00Z");
const clock = () => clockNow;
const tick = (ms = 1000) => {
  clockNow = new Date(clockNow.getTime() + ms);
};
const uuid = () => crypto.randomUUID();
const svc = (userId = SULEYMAN) => personalTasks(env, userId, clock);
const notesSvc = (userId = SULEYMAN) => personalNotes(env, userId, clock);
const db = () => createDb(env.DB);

beforeAll(async () => {
  await seedDatabase(env.DB, {
    hesaplar,
    projeler: ornekProjeler,
    kisiselAlanlar: ornekKisiselAlanlar,
  });
});

/**
 * Örnek ağaç:
 *   A
 *     A1
 *     A2
 *   B
 *   C
 */
async function sampleTodo(userId = SULEYMAN) {
  const noteId = uuid();
  await svc(userId).createTodo({
    id: noteId,
    title: "Örnek liste",
    color: "default",
    pinned: false,
    tasks: [],
  });
  const ids = { A: uuid(), A1: uuid(), A2: uuid(), B: uuid(), C: uuid() };
  const list = await svc(userId).applyOps(noteId, [
    { op: "create", id: ids.A, parentId: null, position: 0, title: "A" },
    { op: "create", id: ids.A1, parentId: ids.A, position: 0, title: "A1" },
    { op: "create", id: ids.A2, parentId: ids.A, position: 1, title: "A2" },
    { op: "create", id: ids.B, parentId: null, position: 1, title: "B" },
    { op: "create", id: ids.C, parentId: null, position: 2, title: "C" },
  ]);
  return { noteId, ids, list };
}

async function rows(noteId: string) {
  return db().select().from(tasks).where(eq(tasks.noteId, noteId));
}

async function row(id: string) {
  return (await db().select().from(tasks).where(eq(tasks.id, id)).get())!;
}

const titles = (list: Task[]) => list.map((t) => t.title);

describe("yapılacaklar notu oluşturma", () => {
  it("not 'todo' türünde en üste oluşur; görevler üst seviyede sırayla eklenir; ilk sürüm yazılır", async () => {
    const id = uuid();
    await svc().createTodo({
      id,
      title: "Alışveriş",
      color: "sari",
      pinned: false,
      tasks: ["Süt", "  ", "Ekmek"],
    });
    const note = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(note).toMatchObject({ kind: "todo", ownerUserId: SULEYMAN, color: "sari" });
    expect(titles(await svc().list(id))).toEqual(["Süt", "Ekmek"]);
    const card = (await notesSvc().list("notlar")).find((n) => n.id === id)!;
    expect(card.tasks.map((t) => t.title)).toEqual(["Süt", "Ekmek"]);
    const versions = await db().select().from(noteVersions).where(eq(noteVersions.noteId, id));
    expect(versions).toHaveLength(1);
    expect((versions[0]!.snapshot as TodoSnapshot).tasks).toHaveLength(2);
  });

  it("açık not tüm görev ağacını taşır", async () => {
    const { noteId, ids } = await sampleTodo();
    const detail = await notesSvc().get(noteId);
    expect(detail.todoTasks.map((t) => t.id)).toEqual([ids.A, ids.A1, ids.A2, ids.B, ids.C]);
    expect(detail.tasks.map((t) => t.title)).toEqual(["A", "B", "C"]);
  });
});

describe("toplu görev işlemleri", () => {
  it("oluştur ve güncelle: alanlar yazılır, tarih kuralı sunucuda da uygulanır", async () => {
    const { noteId, ids } = await sampleTodo();
    await svc().applyOps(noteId, [
      {
        op: "update",
        id: ids.B,
        title: "B!",
        description: "<p>Not</p>",
        startDate: "2026-11-20",
        dueDate: "2026-11-12",
        dueTime: "17:00",
      },
    ]);
    expect(await row(ids.B)).toMatchObject({
      title: "B!",
      description: "<p>Not</p>",
      startDate: "2026-11-12",
      dueDate: "2026-11-12",
      dueTime: "17:00",
      updatedBy: SULEYMAN,
    });
    await svc().applyOps(noteId, [{ op: "update", id: ids.B, dueDate: null, description: "" }]);
    expect(await row(ids.B)).toMatchObject({ dueDate: null, dueTime: null, description: null });
  });

  it("girinti, çıkarma ve sürükle-bırak: istemcinin ağaç işlemi sunucuda aynı sonucu verir", async () => {
    const { noteId, ids, list } = await sampleTodo();
    let server = list;
    const steps = [
      (t: Task[]) => indent(t, ids.B)!,
      (t: Task[]) => outdent(t, ids.A2)!,
      (t: Task[]) => moveTo(t, ids.C, ids.A, 0)!,
      (t: Task[]) => insertAfter(t, ids.A1, uuid(), 1)!,
    ];
    for (const step of steps) {
      const edit = step(server);
      server = await svc().applyOps(noteId, edit.ops);
      expect(server).toEqual(sortLike(server, edit.tasks));
      expect(server).toHaveLength(edit.tasks.length);
    }
    // A altında: C, A (bölünen A1), 1, B; A2 üst seviyede.
    const byId = new Map(server.map((t) => [t.id, t]));
    expect(byId.get(ids.C)!.parentId).toBe(ids.A);
    expect(byId.get(ids.A2)!.parentId).toBeNull();
    expect(byId.get(ids.A1)!.title).toBe("A");
    expect(server.find((t) => t.title === "1")!.parentId).toBe(ids.A);
    expect(server).toEqual(await svc().list(noteId));
  });

  it("taşı: kendi alt ağacına taşıma 409 (TaskOpError) ile reddedilir", async () => {
    const { noteId, ids } = await sampleTodo();
    await expect(
      svc().applyOps(noteId, [{ op: "move", id: ids.A, parentId: ids.A1, position: 0 }]),
    ).rejects.toThrow(TaskOpError);
  });

  it("tamamlanma zinciri sunucuda hesaplanır: son alt görev tamamlanınca üst de tamamlanır", async () => {
    const { noteId, ids } = await sampleTodo();
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A1 }]);
    expect((await row(ids.A)).completedAt).toBeNull();
    tick();
    // İstemci yalnızca son alt görevi bildirir; üstü kendisi tamamlamaz.
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A2 }]);
    const parent = await row(ids.A);
    expect(parent.completedAt).toEqual(clockNow);
    expect(parent.completedBy).toBe(SULEYMAN);
  });

  it("üst görev tamamlanınca alt ağaç tamamlanır; geri açınca alt ağaç ve üstler açılır", async () => {
    const { noteId, ids } = await sampleTodo();
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A }]);
    for (const id of [ids.A, ids.A1, ids.A2]) expect((await row(id)).completedAt).not.toBeNull();
    await svc().applyOps(noteId, [{ op: "uncomplete", id: ids.A1 }]);
    expect((await row(ids.A1)).completedAt).toBeNull();
    expect((await row(ids.A)).completedAt).toBeNull();
    expect((await row(ids.A2)).completedAt).not.toBeNull();
  });

  it("geri al (reopen) tam olarak verilen görevleri ve tamamlanmış üstlerini açar", async () => {
    const { noteId, ids } = await sampleTodo();
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A1 }]);
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A2 }]);
    await svc().applyOps(noteId, [{ op: "reopen", ids: [ids.A2, ids.A] }]);
    expect((await row(ids.A)).completedAt).toBeNull();
    expect((await row(ids.A2)).completedAt).toBeNull();
    expect((await row(ids.A1)).completedAt).not.toBeNull();
  });

  it("sil: alt görevli görev reddedilir; alt ağaçla silinir; tamamlananları sil", async () => {
    const { noteId, ids } = await sampleTodo();
    await expect(svc().applyOps(noteId, [{ op: "delete", id: ids.A }])).rejects.toThrow(
      "Alt görevi olan görev silinemez",
    );
    await svc().applyOps(noteId, [{ op: "delete", id: ids.C }]);
    await svc().applyOps(noteId, [{ op: "complete", id: ids.B }]);
    await svc().applyOps(noteId, [{ op: "clearCompleted" }]);
    expect(titles(await svc().list(noteId))).toEqual(["A", "A1", "A2"]);
    await svc().applyOps(noteId, [{ op: "delete", id: ids.A, withSubtree: true }]);
    expect(await rows(noteId)).toEqual([]);
  });

  it("bir işlem hatalıysa hiçbiri uygulanmaz (batch atomik)", async () => {
    const { noteId, ids } = await sampleTodo();
    const versionsBefore = await db()
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, noteId));
    const newId = uuid();
    await expect(
      svc().applyOps(noteId, [
        { op: "update", id: ids.B, title: "değişmemeli" },
        { op: "create", id: newId, parentId: null, position: 9 },
        { op: "complete", id: ids.A },
        { op: "delete", id: "olmayan-gorev" },
      ]),
    ).rejects.toThrow(TaskOpError);
    expect((await row(ids.B)).title).toBe("B");
    expect((await row(ids.A)).completedAt).toBeNull();
    expect(await db().select().from(tasks).where(eq(tasks.id, newId)).get()).toBeUndefined();
    const versionsAfter = await db()
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, noteId));
    expect(versionsAfter).toEqual(versionsBefore);
  });

  it("başka bir notta kullanılan görev kimliğiyle oluşturma reddedilir", async () => {
    const one = await sampleTodo();
    const two = await sampleTodo();
    await expect(
      svc().applyOps(two.noteId, [
        { op: "create", id: one.ids.B, parentId: null, position: 5, title: "çalıntı" },
      ]),
    ).rejects.toThrow("Görev zaten var");
    expect((await row(one.ids.B)).noteId).toBe(one.noteId);
  });

  it("değişiklik üretmeyen işlem sürüm ve not güncellemesi yazmaz", async () => {
    const { noteId, ids } = await sampleTodo();
    const before = await db().select().from(notes).where(eq(notes.id, noteId)).get();
    tick(VERSION_WINDOW_MS * 2);
    await svc().applyOps(noteId, [{ op: "uncomplete", id: ids.B }]);
    const after = await db().select().from(notes).where(eq(notes.id, noteId)).get();
    expect(after!.updatedAt).toEqual(before!.updatedAt);
  });

  it("not güncellenme bilgisi (updated_by / updated_at) güncellenir", async () => {
    const { noteId, ids } = await sampleTodo();
    tick(5000);
    await svc().applyOps(noteId, [{ op: "update", id: ids.C, title: "C2" }]);
    const note = await db().select().from(notes).where(eq(notes.id, noteId)).get();
    expect(note).toMatchObject({ updatedBy: SULEYMAN, updatedAt: clockNow });
  });
});

describe("sahiplik ve not durumu", () => {
  it("başka kullanıcının notu bulunamadı sayılır", async () => {
    const { noteId, ids } = await sampleTodo();
    await expect(svc(AYSE).applyOps(noteId, [{ op: "complete", id: ids.A }])).rejects.toThrow(
      NoteNotFoundError,
    );
    await expect(svc(AYSE).list(noteId)).rejects.toThrow(NoteNotFoundError);
    await expect(svc(AYSE).convert(noteId, "text")).rejects.toThrow(NoteNotFoundError);
    await expect(svc(AYSE).list("lansman-hazirligi")).rejects.toThrow(NoteNotFoundError);
    expect((await row(ids.A)).completedAt).toBeNull();
  });

  it("metin notunda ve çöpteki notta görev işlemi 409", async () => {
    await expect(svc().applyOps("wifi-sifresi", [{ op: "clearCompleted" }])).rejects.toThrow(
      NoteConflictError,
    );
    const { noteId } = await sampleTodo();
    await notesSvc().trash(noteId);
    await expect(svc().applyOps(noteId, [{ op: "clearCompleted" }])).rejects.toThrow(
      "Çöpteki not düzenlenemez",
    );
    expect(await svc().list("wifi-sifresi")).toEqual([]);
  });

  it("aynı kimlikle ikinci yapılacaklar notu oluşturulamaz", async () => {
    const { noteId } = await sampleTodo();
    await expect(
      svc(AYSE).createTodo({ id: noteId, title: "", color: "default", pinned: false, tasks: [] }),
    ).rejects.toThrow(NoteNotFoundError);
  });
});

describe("metin ↔ yapılacaklar dönüşümü", () => {
  it("metnin satırları üst seviye görev olur; dönüşüm yeni sürüm olarak kaydedilir", async () => {
    const id = uuid();
    await notesSvc().create({
      id,
      title: "Liste",
      bodyHtml: "<p>Süt</p><ul><li><p>Ekmek</p><ul><li><p>Taze</p></li></ul></li></ul>",
      color: "default",
      pinned: false,
    });
    tick();
    await svc().convert(id, "todo");
    const note = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(note).toMatchObject({ kind: "todo", bodyHtml: null, bodyText: "Liste" });
    const list = await svc().list(id);
    expect(titles(list)).toEqual(["Süt", "Ekmek", "Taze"]);
    expect(list.every((t) => t.parentId === null)).toBe(true);
    const versions = await notesSvc().listVersions(id);
    expect(versions).toHaveLength(2);
    expect((await notesSvc().getVersion(id, versions[0]!.id)).html).toContain("<li><p>Süt</p>");
    // Aynı türe dönüştürmek değişiklik yapmaz.
    await svc().convert(id, "todo");
    expect(await notesSvc().listVersions(id)).toHaveLength(2);
  });

  it("görevler girintisi korunarak madde listesine döner; görevler silinir", async () => {
    const { noteId } = await sampleTodo();
    await svc().convert(noteId, "text");
    const note = await notesSvc().get(noteId);
    expect(note.kind).toBe("text");
    expect(note.bodyHtml).toBe(
      "<ul><li><p>A</p><ul><li><p>A1</p></li><li><p>A2</p></li></ul></li><li><p>B</p></li><li><p>C</p></li></ul>",
    );
    expect(await rows(noteId)).toEqual([]);
    const search = await notesSvc().search("A2");
    expect(search.some((r) => r.id === noteId)).toBe(true);
  });

  it("eki olan metin notu yapılacaklara dönüştürülemez", async () => {
    const id = uuid();
    await notesSvc().create({
      id,
      title: "Ekli",
      bodyHtml: "<p>a</p>",
      color: "default",
      pinned: false,
    });
    await db()
      .insert(attachments)
      .values({
        noteId: id,
        r2Key: `test/${id}`,
        name: "a.png",
        size: 10,
        contentType: "image/png",
      });
    await expect(svc().convert(id, "todo")).rejects.toThrow(
      "Eki olan metin notu önce ekler kaldırılmadan yapılacaklara dönüştürülemez.",
    );
    expect((await notesSvc().get(id)).kind).toBe("text");
  });
});

describe("sürümler", () => {
  it("görev değişiklikleri görev ağacı anlık görüntüsüyle 5 dk penceresinde tek sürümü günceller", async () => {
    const { noteId, ids } = await sampleTodo();
    const versions = () => db().select().from(noteVersions).where(eq(noteVersions.noteId, noteId));
    const count = (await versions()).length;
    tick(60_000);
    await svc().applyOps(noteId, [{ op: "update", id: ids.B, title: "B2" }]);
    expect(await versions()).toHaveLength(count);
    const snap = (await versions()).at(-1)!.snapshot as TodoSnapshot;
    expect(snap.tasks.find((t) => t.id === ids.B)!.title).toBe("B2");
    tick(VERSION_WINDOW_MS);
    await svc().applyOps(noteId, [{ op: "update", id: ids.B, title: "B3" }]);
    expect(await versions()).toHaveLength(count + 1);
  });

  it("yapılacaklar sürümü geri yüklenince görev ağacı geri gelir", async () => {
    const { noteId, ids } = await sampleTodo();
    tick(VERSION_WINDOW_MS * 2);
    await svc().applyOps(noteId, [
      { op: "delete", id: ids.A, withSubtree: true },
      { op: "update", id: ids.B, title: "değişti" },
    ]);
    const list = await notesSvc().listVersions(noteId);
    const old = list.find((v) => !v.current)!;
    tick(1000);
    await notesSvc().restoreVersion(noteId, old.id);
    expect(titles(await svc().list(noteId))).toEqual(["A", "A1", "A2", "B", "C"]);
    expect((await row(ids.A1)).parentId).toBe(ids.A);
    expect(await notesSvc().listVersions(noteId)).toHaveLength(list.length + 1);
  });

  it("dönüşümden önceki metin sürümü geri yüklenince not metne döner", async () => {
    const id = uuid();
    await notesSvc().create({
      id,
      title: "Geri",
      bodyHtml: "<p>Bir</p>",
      color: "default",
      pinned: false,
    });
    tick();
    await svc().convert(id, "todo");
    const textVersion = (await notesSvc().listVersions(id)).find((v) => !v.current)!;
    await notesSvc().restoreVersion(id, textVersion.id);
    const note = await notesSvc().get(id);
    expect(note).toMatchObject({ kind: "text", bodyHtml: "<p>Bir</p>" });
    expect(await rows(id)).toEqual([]);
  });

  it("yapılacaklar notunun başlığı değişince sürüm görev ağacıyla yazılır", async () => {
    const { noteId } = await sampleTodo();
    tick(VERSION_WINDOW_MS * 2);
    await notesSvc().update(noteId, { title: "Yeni başlık" });
    const latest = (await notesSvc().listVersions(noteId))[0]!;
    expect(latest.title).toBe("Yeni başlık");
    const v = await db().select().from(noteVersions).where(eq(noteVersions.id, latest.id)).get();
    expect((v!.snapshot as TodoSnapshot).tasks).toHaveLength(5);
  });
});

describe("kopyasını oluştur", () => {
  it("görevler ağaç, sıra ve tamamlanma bilgisiyle yeni kimliklerle kopyalanır", async () => {
    const { noteId, ids } = await sampleTodo();
    await svc().applyOps(noteId, [{ op: "complete", id: ids.A1 }]);
    const copy = uuid();
    await notesSvc().duplicate(noteId, copy);
    const original = await svc().list(noteId);
    const copied = await svc().list(copy);
    expect(titles(copied)).toEqual(titles(original));
    expect(copied.some((t) => original.some((o) => o.id === t.id))).toBe(false);
    const a = copied.find((t) => t.title === "A")!;
    expect(copied.filter((t) => t.parentId === a.id).map((t) => t.title)).toEqual(["A1", "A2"]);
    expect(copied.find((t) => t.title === "A1")!.completedAt).not.toBeNull();
    // Kopyadaki değişiklik aslını etkilemez.
    await svc().applyOps(copy, [{ op: "complete", id: a.id }]);
    expect((await row(ids.A)).completedAt).toBeNull();
  });
});

describe("HTTP uçları", () => {
  async function session() {
    const { cookie } = await verifiedUser();
    const id = uuid();
    const res = await postForm(
      "/api/notlar",
      { intent: "create-todo", id, title: "HTTP listesi", tasks: JSON.stringify(["Bir", "İki"]) },
      { cookie },
    );
    expect(res.status).toBe(200);
    return { cookie, id };
  }

  it("POST /api/notlar/:id/gorevler işlemleri uygular ve yeni listeyi döner; GET listeyi verir", async () => {
    const { cookie, id } = await session();
    const listRes = await get(`/api/notlar/${id}/gorevler`, { cookie });
    expect(listRes.status).toBe(200);
    const { tasks: list } = (await listRes.json()) as { tasks: Task[] };
    expect(titles(list)).toEqual(["Bir", "İki"]);
    const child = uuid();
    const ops: TaskOp[] = [
      { op: "create", id: child, parentId: list[0]!.id, position: 0, title: "Alt" },
      { op: "complete", id: child },
    ];
    const res = await postJson(`/api/notlar/${id}/gorevler`, { ops }, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; tasks: Task[] };
    expect(body.ok).toBe(true);
    // Tek alt görev tamamlanınca üst görev zincirle tamamlanır.
    expect(body.tasks.find((t) => t.id === list[0]!.id)!.completedAt).not.toBeNull();
  });

  it("istemcinin gönderdiği tamamlanma alanları yok sayılır", async () => {
    const { cookie, id } = await session();
    const { tasks: list } = (await (
      await get(`/api/notlar/${id}/gorevler`, { cookie })
    ).json()) as {
      tasks: Task[];
    };
    const res = await postJson(
      `/api/notlar/${id}/gorevler`,
      {
        ops: [{ op: "update", id: list[1]!.id, title: "İki!", completedAt: 123, completedBy: "x" }],
      },
      { cookie },
    );
    expect(res.status).toBe(200);
    expect(await row(list[1]!.id)).toMatchObject({
      title: "İki!",
      completedAt: null,
      completedBy: null,
    });
  });

  it("hatalar: 400 geçersiz gövde, 415 JSON değil, 404 başkasının notu, 409 uygulanamayan işlem", async () => {
    const { cookie, id } = await session();
    const path = `/api/notlar/${id}/gorevler`;
    expect((await postJson(path, { ops: [{ op: "uçur" }] }, { cookie })).status).toBe(400);
    const broken = await exports.default.fetch(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: ORIGIN },
      body: "{bozuk",
    });
    expect(broken.status).toBe(400);
    expect((await postForm(path, { ops: "[]" }, { cookie })).status).toBe(415);
    expect(
      (
        await postJson(
          `/api/notlar/market/gorevler`,
          { ops: [{ op: "clearCompleted" }] },
          { cookie },
        )
      ).status,
    ).toBe(404);
    expect((await get(`/api/notlar/market/gorevler`, { cookie })).status).toBe(404);
    const res = await postJson(path, { ops: [{ op: "delete", id: "olmayan" }] }, { cookie });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "Görev bulunamadı" });
  });

  it("oturumsuz istek reddedilir", async () => {
    const res = await postJson(`/api/notlar/market/gorevler`, { ops: [{ op: "clearCompleted" }] });
    expect([302, 401, 403]).toContain(res.status);
    const market = await db()
      .select()
      .from(tasks)
      .where(and(eq(tasks.noteId, "market")));
    expect(market.length).toBeGreaterThan(0);
  });

  it("/api/notlar convert eylemi; eki olan notta 409", async () => {
    const { cookie, id } = await session();
    const res = await postForm("/api/notlar", { intent: "convert", id, to: "text" }, { cookie });
    expect(res.status).toBe(200);
    const note = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(note).toMatchObject({
      kind: "text",
      bodyHtml: "<ul><li><p>Bir</p></li><li><p>İki</p></li></ul>",
    });
    await db()
      .insert(attachments)
      .values({
        noteId: id,
        r2Key: `test/http/${id}`,
        name: "a.pdf",
        size: 1,
        contentType: "application/pdf",
      });
    const blocked = await postForm(
      "/api/notlar",
      { intent: "convert", id, to: "todo" },
      { cookie },
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ ok: false });
  });
});

/** Sunucu listesi ağaç sırasındadır; karşılaştırma için yerel listeyi aynı sıraya dizer. */
function sortLike(server: Task[], local: Task[]): Task[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  return server.map((t) => byId.get(t.id) ?? t);
}
