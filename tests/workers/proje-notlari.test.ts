import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { notes, notifications, taskAssignees } from "~/db/schema";
import { seedTaskId } from "~/db/seed";
import { noteAccess } from "~/lib/note-access.server";
import { NoteNotFoundError, purgeExpiredTrash, searchAccessible } from "~/lib/notes.server";
import { ForbiddenError, ProjectNotFoundError } from "~/lib/project-access.server";
import { NoteConflictError } from "~/lib/note-store.server";
import { TaskOpError } from "~/domain/tasks/ops";
import { verifiedUser } from "./kimlik-yardimcilar";
import { cookies, DAY, EV, form, getJson, ID, ops, seed, uuid, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
let clockNow = new Date("2026-11-07T10:00:00Z");
const clock = () => clockNow;
const access = (userId: string = ID.suleyman) => noteAccess(env, userId, clock);

/** Yönetici olarak Web Sitesi Yenileme projesinde yeni not. */
async function projectNote(kind: "text" | "todo" = "text", title = "Proje notu") {
  const id = uuid();
  const { notes: svc, tasks } = await access().forProject(WEB);
  if (kind === "text") {
    await svc.create({ id, title, bodyHtml: "<p>gövde</p>", color: "default", pinned: false });
  } else {
    await tasks.createTodo({ id, title, color: "default", pinned: false, tasks: ["Bir", "İki"] });
  }
  return id;
}

async function personalNote(userId: string, title = "Kişisel not") {
  const id = uuid();
  await access(userId).run({
    intent: "create",
    id,
    title,
    bodyHtml: "<p>özel</p>",
    color: "sari",
    pinned: false,
  });
  return id;
}

type Who = "suleyman" | "mehmet" | "can" | "yabanci";
let jar: Record<Who, string>;

beforeAll(async () => {
  await seed();
  const c = await cookies("suleyman", "mehmet", "can");
  jar = { ...c, yabanci: (await verifiedUser()).cookie };
});

/* ------------------------------------------------------------------ */
/* HTTP: her not eyleminde üç rol + yabancı                              */
/* ------------------------------------------------------------------ */

type Case = {
  name: string;
  /** Her deneme için hazırlık: form alanlarını döner. */
  prepare: () => Promise<Record<string, string>>;
};

const cases: Case[] = [
  {
    name: "create",
    prepare: async () => ({ intent: "create", id: uuid(), projectId: WEB, title: "Yeni" }),
  },
  {
    name: "create-todo",
    prepare: async () => ({
      intent: "create-todo",
      id: uuid(),
      projectId: WEB,
      title: "Liste",
      tasks: '["A"]',
    }),
  },
  {
    name: "update",
    prepare: async () => ({ intent: "update", id: await projectNote(), title: "X" }),
  },
  {
    name: "color",
    prepare: async () => ({ intent: "color", id: await projectNote(), color: "mor" }),
  },
  {
    name: "pin",
    prepare: async () => ({ intent: "pin", id: await projectNote(), pinned: "true" }),
  },
  {
    name: "move",
    prepare: async () => ({
      intent: "move",
      id: await projectNote(),
      pinned: "false",
      toIndex: "2",
    }),
  },
  { name: "archive", prepare: async () => ({ intent: "archive", id: await projectNote() }) },
  {
    name: "unarchive",
    prepare: async () => {
      const id = await projectNote();
      await (await access().forProject(WEB)).notes.archive(id);
      return { intent: "unarchive", id };
    },
  },
  { name: "trash", prepare: async () => ({ intent: "trash", id: await projectNote() }) },
  {
    name: "restore",
    prepare: async () => {
      const id = await projectNote();
      await (await access().forProject(WEB)).notes.trash(id);
      return { intent: "restore", id };
    },
  },
  {
    name: "delete",
    prepare: async () => {
      const id = await projectNote();
      await (await access().forProject(WEB)).notes.trash(id);
      return { intent: "delete", id };
    },
  },
  {
    name: "duplicate",
    prepare: async () => ({ intent: "duplicate", id: await projectNote(), newId: uuid() }),
  },
  {
    name: "discard",
    prepare: async () => {
      const id = await projectNote();
      const copy = uuid();
      // HTTP isteği gerçek saatle çalışır; geri alma penceresi için kopya da gerçek saatle.
      await (await noteAccess(env, ID.suleyman).forProject(WEB)).notes.duplicate(id, copy);
      return { intent: "discard", id: copy };
    },
  },
  {
    name: "convert",
    prepare: async () => ({ intent: "convert", id: await projectNote(), to: "todo" }),
  },
  {
    name: "restore-version",
    prepare: async () => {
      const id = await projectNote();
      const [v] = await (await access().forProject(WEB)).notes.listVersions(id);
      return { intent: "restore-version", id, versionId: v!.id };
    },
  },
  { name: "empty-trash", prepare: async () => ({ intent: "empty-trash", projectId: WEB }) },
  {
    name: "copy-to (kişisel alana)",
    prepare: async () => ({ intent: "copy-to", id: await projectNote(), newId: uuid() }),
  },
];

const expected: Record<Who, number> = { suleyman: 200, mehmet: 200, can: 403, yabanci: 404 };

describe("proje notu eylemleri: rol denetimi her istekte (HTTP /api/notlar)", () => {
  for (const c of cases) {
    it(`${c.name}: yönetici ve düzenleyici yapar, görüntüleyici 403, üye olmayan 404`, async () => {
      for (const who of Object.keys(expected) as Who[]) {
        const fields = await c.prepare();
        const res = await form("/api/notlar", fields, jar[who]);
        expect(res.status, `${c.name} / ${who}`).toBe(expected[who]);
        if (expected[who] === 200) expect(res.body.ok).toBe(true);
        else expect(res.body).toMatchObject({ ok: false });
      }
    });
  }

  it("görüntüleyicinin 403 aldığı eylem notu değiştirmez", async () => {
    const id = await projectNote("text", "Değişmeyecek");
    await form("/api/notlar", { intent: "update", id, title: "Bozuldu" }, jar.can);
    await form("/api/notlar", { intent: "trash", id }, jar.can);
    const row = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(row).toMatchObject({ title: "Değişmeyecek", trashedAt: null });
  });

  it("sürüm geçmişi ve görev listesi her üyeye açık, üye olmayana 404", async () => {
    const id = await projectNote("todo");
    for (const who of ["suleyman", "mehmet", "can"] as const) {
      expect((await getJson(`/api/notlar/${id}/surumler`, jar[who])).status).toBe(200);
      const t = await getJson<{ tasks: unknown[]; assignees: object }>(
        `/api/notlar/${id}/gorevler`,
        jar[who],
      );
      expect(t.status).toBe(200);
      expect(t.body.tasks).toHaveLength(2);
    }
    expect((await getJson(`/api/notlar/${id}/surumler`, jar.yabanci)).status).toBe(404);
    expect((await getJson(`/api/notlar/${id}/gorevler`, jar.yabanci)).status).toBe(404);
  });

  it("üye olmadığı projede not oluşturan 404 alır", async () => {
    const res = await form(
      "/api/notlar",
      { intent: "create", id: uuid(), projectId: EV, title: "x" },
      jar.mehmet,
    );
    expect(res).toEqual({ status: 404, body: { ok: false, error: "Proje bulunamadı" } });
  });
});

describe("görev işlemleri: rol denetimi (HTTP /api/notlar/:id/gorevler)", () => {
  const taskCases: { name: string; op: (t: string) => unknown }[] = [
    { name: "işaretleme", op: (t) => ({ op: "complete", id: t }) },
    { name: "düzenleme", op: (t) => ({ op: "update", id: t, title: "Yeni başlık" }) },
    {
      name: "ekleme",
      op: () => ({ op: "create", id: uuid(), parentId: null, position: 9, title: "Ek" }),
    },
    { name: "atama", op: (t) => ({ op: "assign", id: t, userIds: [ID.can] }) },
  ];

  for (const c of taskCases) {
    it(`${c.name}: yönetici ve düzenleyici yapar, görüntüleyici 403, üye olmayan 404`, async () => {
      for (const who of Object.keys(expected) as Who[]) {
        const id = await projectNote("todo");
        const { tasks } = await (await access().forProject(WEB)).tasks.state(id);
        const res = await ops(id, [c.op(tasks[0]!.id)], jar[who]);
        expect(res.status, `${c.name} / ${who}`).toBe(expected[who]);
      }
    });
  }

  it("görüntüleyici kendisine atanmış görevi bile işaretleyemez", async () => {
    const task = seedTaskId("lansman-hazirligi", 4); // Lansman duyurusu → Ayşe, Can
    const res = await ops("lansman-hazirligi", [{ op: "complete", id: task }], jar.can);
    expect(res.status).toBe(403);
    const { tasks } = await (await access().forProject(WEB)).tasks.state("lansman-hazirligi");
    expect(tasks.find((t) => t.id === task)!.completedAt).toBeNull();
  });

  it("yanıt görevlerle birlikte atamaları da döner", async () => {
    const id = await projectNote("todo");
    const { tasks } = await (await access().forProject(WEB)).tasks.state(id);
    const res = await ops(
      id,
      [{ op: "assign", id: tasks[0]!.id, userIds: [ID.zeynep, ID.can] }],
      jar.mehmet,
    );
    expect(res.status).toBe(200);
    expect(res.body.assignees).toEqual({ [tasks[0]!.id]: [ID.zeynep, ID.can] });
  });
});

/* ------------------------------------------------------------------ */
/* Ortak alan davranışı                                                 */
/* ------------------------------------------------------------------ */

describe("projede her şey ortaktır", () => {
  it("oluşturan ve son düzenleyen kaydedilir ve not ayrıntısında görünür", async () => {
    const id = await projectNote("text", "Ortak");
    const mehmet = await access(ID.mehmet).forNote(id);
    await mehmet.notes.update(id, { title: "Ortak (güncel)" });
    const detail = await (await access(ID.can).forNote(id)).notes.get(id);
    expect(detail.projectId).toBe(WEB);
    expect(detail.createdBy).toMatchObject({ id: ID.suleyman, name: "Süleyman Kara" });
    expect(detail.updatedBy).toMatchObject({ id: ID.mehmet, name: "Mehmet Kaya" });
  });

  it("sabitleme, renk, sıra ve arşiv herkes için tektir", async () => {
    const id = await projectNote("text", "Paylaşılan");
    const m = (await access(ID.mehmet).forProject(WEB)).notes;
    await m.setPinned(id, true);
    await m.setColor(id, "turkuaz");
    const seen = (await (await access(ID.can).forProject(WEB)).notes.list("notlar")).find(
      (n) => n.id === id,
    );
    expect(seen).toMatchObject({ pinned: true, color: "turkuaz" });
    await m.archive(id);
    const archive = await (await access(ID.suleyman).forProject(WEB)).notes.list("arsiv");
    expect(archive.map((n) => n.id)).toContain(id);
  });

  it("proje çöpü kişisel çöpten ayrıdır; çöpü boşaltmak yalnızca o projeyi etkiler", async () => {
    const p = await projectNote("text", "Proje çöpü");
    const own = await personalNote(ID.suleyman, "Kişisel çöp");
    const svc = (await access().forProject(WEB)).notes;
    await svc.trash(p);
    await (await access().forNote(own)).notes.trash(own);
    expect((await svc.list("cop")).map((n) => n.id)).toEqual(expect.arrayContaining([p]));
    expect((await svc.list("cop")).map((n) => n.id)).not.toContain(own);
    await svc.emptyTrash();
    expect(await db().select().from(notes).where(eq(notes.id, p))).toEqual([]);
    expect(await db().select().from(notes).where(eq(notes.id, own))).toHaveLength(1);
  });

  it("cron 7 günden eski proje çöpünü de kalıcı siler", async () => {
    const id = await projectNote("todo", "Eski proje çöpü");
    const t = new Date("2027-02-01T00:00:00Z");
    await db()
      .update(notes)
      .set({ trashedAt: new Date(t.getTime() - 8 * DAY) })
      .where(eq(notes.id, id));
    await purgeExpiredTrash(env, t);
    expect(await db().select().from(notes).where(eq(notes.id, id))).toEqual([]);
  });

  it("birleşik arama kişisel notlar ve erişilen projelerde arar, kaynağı belirtir", async () => {
    const results = await searchAccessible(env, ID.zeynep, "kasım");
    const kitap = results.find((r) => r.id === "kasim-kitabi");
    expect(kitap?.source).toEqual({
      kind: "project",
      projectId: "kitap-kulubu",
      name: "Kitap Kulübü",
      color: "yesil",
    });
    expect(results.some((r) => r.id === "nakliye-listesi")).toBe(false);
    const mine = await searchAccessible(env, ID.suleyman, "market");
    expect(mine.find((r) => r.id === "market")?.source).toEqual({ kind: "personal" });
  });

  it("alan araması da kaynağı taşır", async () => {
    const r = await (await access(ID.can).forProject(WEB)).notes.search("barındırma");
    expect(r.map((x) => x.id)).toContain("karar-gunlugu");
    expect(r[0]!.source).toMatchObject({ kind: "project", name: "Web Sitesi Yenileme" });
  });
});

/* ------------------------------------------------------------------ */
/* Taşı veya kopyala…                                                   */
/* ------------------------------------------------------------------ */

describe("kişisel notu projeye taşıma", () => {
  it("not projenin olur, kişisel alandan çıkar ve en üste eklenir", async () => {
    const id = await personalNote(ID.mehmet, "Taşınacak");
    await access(ID.mehmet).moveToProject(id, WEB);
    const row = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(row).toMatchObject({ ownerUserId: null, projectId: WEB, archivedAt: null });
    const personal = await (await access(ID.mehmet).forNote(id)).notes.list("notlar");
    expect(personal[0]!.id).toBe(id);
    expect(personal.length).toBeGreaterThan(1);
  });

  it("10 sn içinde geri alınabilir; not eski yerine döner", async () => {
    const id = await personalNote(ID.suleyman, "Geri alınacak");
    await db().update(notes).set({ pinned: true, position: 42 }).where(eq(notes.id, id));
    clockNow = new Date("2026-11-07T10:00:00Z");
    await access().moveToProject(id, WEB);
    clockNow = new Date("2026-11-07T10:00:09Z");
    await access().undoMove(id);
    const row = await db().select().from(notes).where(eq(notes.id, id)).get();
    expect(row).toMatchObject({
      ownerUserId: ID.suleyman,
      projectId: null,
      pinned: true,
      position: 42,
      moveOrigin: null,
    });
  });

  it("süre geçince taşıma kesinleşir ve geri alınamaz", async () => {
    const id = await personalNote(ID.suleyman, "Kesinleşecek");
    clockNow = new Date("2026-11-07T11:00:00Z");
    await access().moveToProject(id, WEB);
    clockNow = new Date("2026-11-07T11:00:16Z");
    await expect(access().undoMove(id)).rejects.toThrow(NoteConflictError);
    expect((await db().select().from(notes).where(eq(notes.id, id)).get())?.projectId).toBe(WEB);
  });

  it("taşımayı yalnızca taşıyan geri alabilir", async () => {
    const id = await personalNote(ID.suleyman, "Başkası geri alamaz");
    clockNow = new Date("2026-11-07T12:00:00Z");
    await access().moveToProject(id, WEB);
    await expect(access(ID.mehmet).undoMove(id)).rejects.toThrow(NoteNotFoundError);
  });

  it("görüntüleyici taşıyamaz, üye olmayan projeye taşınamaz", async () => {
    const own = await personalNote(ID.can, "Can'ın notu");
    await expect(access(ID.can).moveToProject(own, WEB)).rejects.toThrow(ForbiddenError);
    const m = await personalNote(ID.mehmet, "Mehmet'in notu");
    await expect(access(ID.mehmet).moveToProject(m, EV)).rejects.toThrow(ProjectNotFoundError);
    const row = await db().select().from(notes).where(eq(notes.id, own)).get();
    expect(row?.ownerUserId).toBe(ID.can);
  });

  it("proje notu taşınamaz; başkasının kişisel notu bulunamaz", async () => {
    await expect(access().moveToProject("karar-gunlugu", EV)).rejects.toThrow(
      "Proje notu taşınamaz, yalnızca kopyalanır.",
    );
    await expect(access(ID.mehmet).moveToProject("market", WEB)).rejects.toThrow(NoteNotFoundError);
  });

  it("HTTP: taşı → geri al", async () => {
    const id = await personalNote(ID.mehmet, "HTTP taşıma");
    const moved = await form(
      "/api/notlar",
      { intent: "move-to-project", id, projectId: WEB },
      jar.mehmet,
    );
    expect(moved).toEqual({ status: 200, body: { ok: true } });
    expect((await form("/api/notlar", { intent: "undo-move", id }, jar.mehmet)).status).toBe(200);
    expect((await db().select().from(notes).where(eq(notes.id, id)).get())?.ownerUserId).toBe(
      ID.mehmet,
    );
    const viewer = await personalNote(ID.can, "Görüntüleyici taşıyamaz");
    expect(
      (
        await form(
          "/api/notlar",
          { intent: "move-to-project", id: viewer, projectId: WEB },
          jar.can,
        )
      ).status,
    ).toBe(403);
  });
});

describe("kopyalama", () => {
  it("proje notu kişisel alana kopyalanır; asıl not kalır, atamalar kopyalanmaz", async () => {
    const copy = uuid();
    await access(ID.mehmet).copyTo("lansman-hazirligi", copy, null);
    const row = await db().select().from(notes).where(eq(notes.id, copy)).get();
    expect(row).toMatchObject({ ownerUserId: ID.mehmet, projectId: null, kind: "todo" });
    const { tasks, assignees } = await (await access(ID.mehmet).forNote(copy)).tasks.state(copy);
    expect(tasks.map((t) => t.title)).toContain("Hakkımızda sayfası");
    expect(assignees).toEqual({});
    expect(
      await db()
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, tasks.find((t) => t.title === "SEO kontrolleri")!.id)),
    ).toEqual([]);
    expect(
      (await db().select().from(notes).where(eq(notes.id, "lansman-hazirligi")).get())?.projectId,
    ).toBe(WEB);
  });

  it("başka projeye kopyada yalnızca hedef projenin üyesi olan atananlar kalır", async () => {
    const copy = uuid();
    await access(ID.suleyman).copyTo("lansman-hazirligi", copy, EV);
    const { tasks, assignees } = await (await access().forNote(copy)).tasks.state(copy);
    const duyuru = tasks.find((t) => t.title === "Lansman duyurusu")!;
    const icerik = tasks.find((t) => t.title === "İçerik yazımı")!;
    expect(assignees[duyuru.id]).toEqual([ID.ayse]);
    expect(assignees[icerik.id]).toBeUndefined();
  });

  it("kişisel not projeye kopyalanır; asıl not kişisel alanda kalır", async () => {
    const id = await personalNote(ID.mehmet, "Kopyalanacak");
    const copy = uuid();
    await access(ID.mehmet).copyTo(id, copy, WEB);
    expect((await db().select().from(notes).where(eq(notes.id, copy)).get())?.projectId).toBe(WEB);
    expect((await db().select().from(notes).where(eq(notes.id, id)).get())?.ownerUserId).toBe(
      ID.mehmet,
    );
  });

  it("görüntüleyici proje notunu kopyalayamaz; görüntüleyici olduğu projeye kopyalanamaz", async () => {
    await expect(access(ID.can).copyTo("karar-gunlugu", uuid(), null)).rejects.toThrow(
      ForbiddenError,
    );
    const own = await personalNote(ID.can, "Can kopya");
    await expect(access(ID.can).copyTo(own, uuid(), WEB)).rejects.toThrow(ForbiddenError);
  });

  it("HTTP: kopya kimliği yanıtta döner (toast 'Aç')", async () => {
    const newId = uuid();
    const res = await form(
      "/api/notlar",
      { intent: "copy-to", id: "karar-gunlugu", newId, projectId: EV },
      jar.suleyman,
    );
    expect(res).toEqual({ status: 200, body: { ok: true, id: newId } });
  });
});

/* ------------------------------------------------------------------ */
/* Atama                                                                */
/* ------------------------------------------------------------------ */

describe("görev ataması", () => {
  it("birden çok kişi atanabilir; görüntüleyici de atanabilir", async () => {
    const id = await projectNote("todo");
    const t = await (await access().forProject(WEB)).tasks.state(id);
    const res = await (
      await access(ID.mehmet).forNote(id)
    ).tasks.apply(id, [{ op: "assign", id: t.tasks[0]!.id, userIds: [ID.ayse, ID.can] }]);
    expect(res.assignees[t.tasks[0]!.id]).toEqual([ID.ayse, ID.can]);
  });

  it("yalnızca proje üyeleri atanabilir", async () => {
    const svc = (await access().forProject(EV)).tasks;
    const t = await svc.state("nakliye-listesi");
    await expect(
      svc.apply("nakliye-listesi", [{ op: "assign", id: t.tasks[0]!.id, userIds: [ID.mehmet] }]),
    ).rejects.toThrow(TaskOpError);
  });

  it("kişisel notlarda atama yok", async () => {
    const id = uuid();
    const personal = noteAccess(env, ID.suleyman, clock);
    await personal.run({
      intent: "create-todo",
      id,
      title: "Kişisel liste",
      color: "default",
      pinned: false,
      tasks: ["A"],
    });
    const { tasks } = await (await personal.forNote(id)).tasks.state(id);
    await expect(
      (await personal.forNote(id)).tasks.apply(id, [
        { op: "assign", id: tasks[0]!.id, userIds: [ID.suleyman] },
      ]),
    ).rejects.toThrow("Kişisel notlarda atama yok");
  });

  it("atama kaldırılabilir; yeni atanana bildirim gider, kendini atayana gitmez", async () => {
    const id = await projectNote("todo", "Bildirimli liste");
    const svc = (await access(ID.mehmet).forNote(id)).tasks;
    const { tasks } = await svc.state(id);
    const task = tasks[0]!.id;
    await svc.apply(id, [{ op: "assign", id: task, userIds: [ID.zeynep, ID.mehmet] }]);
    const notes1 = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.noteId, id), eq(notifications.type, "goreve_atandi")));
    expect(notes1.map((n) => n.userId)).toEqual([ID.zeynep]);
    expect(notes1[0]!.data).toMatchObject({ taskTitle: "Bir", noteTitle: "Bildirimli liste" });
    const after = await svc.apply(id, [{ op: "assign", id: task, userIds: [] }]);
    expect(after.assignees).toEqual({});
  });

  it("görev silinince atamaları da silinir", async () => {
    const id = await projectNote("todo");
    const svc = (await access().forNote(id)).tasks;
    const { tasks } = await svc.state(id);
    await svc.apply(id, [{ op: "assign", id: tasks[1]!.id, userIds: [ID.can] }]);
    await svc.apply(id, [{ op: "delete", id: tasks[1]!.id }]);
    expect(
      await db().select().from(taskAssignees).where(eq(taskAssignees.taskId, tasks[1]!.id)),
    ).toEqual([]);
  });
});
