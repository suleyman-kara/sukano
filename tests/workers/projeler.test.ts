import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import {
  invitations,
  noteVersions,
  notes,
  notifications,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  type ProjectRole,
} from "~/db/schema";
import { noteAccess } from "~/lib/note-access.server";
import {
  ForbiddenError,
  ProjectNotFoundError,
  ProjectRuleError,
} from "~/lib/project-access.server";
import { projectsService, purgeDeletedProjectsOlderThanRetention } from "~/lib/projects.server";
import { purgeDeletedProjects } from "../../workers/scheduled";
import { verifiedUser } from "./kimlik-yardimcilar";
import { cookies, EV, form, getJson, ID, seed, uuid, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
let clockNow = new Date("2026-11-07T10:00:00Z");
const clock = () => clockNow;
const svc = (userId: string = ID.suleyman) => projectsService(env, userId, clock);

type Who = "suleyman" | "mehmet" | "can" | "yabanci";
let jar: Record<Who, string>;

beforeAll(async () => {
  await seed();
  const c = await cookies("suleyman", "mehmet", "can");
  jar = { ...c, yabanci: (await verifiedUser()).cookie };
});

async function addMember(projectId: string, userId: string, role: ProjectRole) {
  await db().insert(projectMembers).values({ projectId, userId, role });
}

/**
 * Süleyman'ın açtığı yeni proje: Ayşe yönetici, Mehmet düzenleyici, Can görüntüleyici.
 * İçinde Can ve Mehmet'e atanmış görevli bir yapılacaklar notu.
 */
async function team(name = "Ekip projesi") {
  const { id } = await svc().create({ name, color: "mor", description: null, emoji: null });
  await addMember(id, ID.ayse, "yonetici");
  await addMember(id, ID.mehmet, "duzenleyici");
  await addMember(id, ID.can, "goruntuleyici");
  const noteId = uuid();
  const access = await noteAccess(env, ID.suleyman, clock).forProject(id);
  await access.tasks.createTodo({
    id: noteId,
    title: "Ekip listesi",
    color: "default",
    pinned: false,
    tasks: ["Birinci", "İkinci"],
  });
  const { tasks: list } = await access.tasks.state(noteId);
  await access.tasks.apply(noteId, [
    { op: "assign", id: list[0]!.id, userIds: [ID.can, ID.mehmet] },
  ]);
  return { id, noteId, taskId: list[0]!.id };
}

const member = (projectId: string, userId: string) =>
  db()
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();

const expectStatus = async (
  path: string,
  fields: (who: Who) => Record<string, string>,
  expected: Record<Who, number>,
) => {
  for (const who of Object.keys(expected) as Who[]) {
    const res = await form(path, fields(who), jar[who]);
    expect(res.status, `${fields(who).intent} / ${who}`).toBe(expected[who]);
  }
};

describe("tohum verisi", () => {
  it("silinmiş 'Bütçe 2026' yalnızca yöneticilerinin listesinde, sol menüde değil", async () => {
    const list = await projectsService(env, ID.suleyman).deleted();
    expect(list.find((p) => p.id === "butce-2026")).toMatchObject({
      name: "Bütçe 2026",
      deletedBy: { id: ID.ayse, name: "Ayşe Demir" },
      daysLeft: 5,
    });
    expect(
      (await projectsService(env, ID.mehmet).sidebar()).projects.map((p) => p.id),
    ).not.toContain("butce-2026");
  });

  it("Süleyman'ın Fotoğraf Arşivi'ne bekleyen daveti var", async () => {
    const { invitationsService } = await import("~/lib/invitations.server");
    const list = await invitationsService(env, ID.suleyman).list();
    expect(list.pending.map((p) => [p.project.name, p.role, p.invitedBy?.name])).toEqual([
      ["Fotoğraf Arşivi", "duzenleyici", "Ayşe Demir"],
    ]);
  });
});

describe("proje oluşturma ve sıra", () => {
  it("projeyi açan yönetici olur ve proje kişisel sıranın sonuna eklenir", async () => {
    const { id } = await svc(ID.mehmet).create({
      name: "Mehmet'in projesi",
      color: "mavi",
      description: "Deneme",
      emoji: "🚀",
    });
    expect((await member(id, ID.mehmet))?.role).toBe("yonetici");
    const { projects: list } = await svc(ID.mehmet).sidebar();
    expect(list.at(-1)).toMatchObject({
      id,
      name: "Mehmet'in projesi",
      emoji: "🚀",
      role: "yonetici",
      noteCount: 0,
    });
  });

  it("HTTP: oluşturma kimliği döner; boş ad 400", async () => {
    const id = uuid();
    const ok = await form("/api/projeler", { intent: "create", id, name: "HTTP projesi" }, jar.can);
    expect(ok).toEqual({ status: 200, body: { ok: true, id } });
    expect((await member(id, ID.can))?.role).toBe("yonetici");
    const bad = await form("/api/projeler", { intent: "create", name: " " }, jar.can);
    expect(bad).toEqual({ status: 400, body: { ok: false, error: "Proje adı gerekli" } });
    const dup = await form("/api/projeler", { intent: "create", id, name: "Aynı" }, jar.mehmet);
    expect(dup.status).toBe(404);
  });

  it("sol menü sırası kişiye özeldir; üye olunmayan kimlikler saklanmaz", async () => {
    await svc(ID.zeynep).reorder(["kitap-kulubu", EV, WEB]);
    const { projects: list } = await svc(ID.zeynep).sidebar();
    expect(list.map((p) => p.id).slice(0, 2)).toEqual(["kitap-kulubu", WEB]);
    const res = await form(
      "/api/projeler",
      { intent: "reorder", order: JSON.stringify([WEB, "kitap-kulubu"]) },
      jar.can,
    );
    expect(res.status).toBe(200);
    const suleyman = await svc().sidebar();
    expect(suleyman.projects.map((p) => p.id).slice(0, 3)).toEqual([WEB, EV, "kitap-kulubu"]);
  });

  it("sol menü etkin not sayısını ve rolü taşır", async () => {
    const { projects: list } = await svc(ID.can).sidebar();
    expect(list.find((p) => p.id === WEB)).toMatchObject({ role: "goruntuleyici", noteCount: 8 });
  });

  it("GET /api/projeler sol menü verisini döner", async () => {
    const res = await getJson<{ projects: { id: string }[]; deletedCount: number }>(
      "/api/projeler",
      jar.mehmet,
    );
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p) => p.id)).toContain(WEB);
    expect(res.body.deletedCount).toBe(0);
  });
});

describe("proje ayarlarını düzenleme", () => {
  it("yalnızca yönetici düzenler; düzenleyici ve görüntüleyici 403, üye olmayan 404", async () => {
    const { id } = await team();
    await expectStatus(
      `/api/projeler/${id}`,
      () => ({ intent: "update", name: "Yeni ad", color: "sari", description: "Açıklama" }),
      { mehmet: 403, can: 403, yabanci: 404, suleyman: 200 },
    );
    const row = await db().select().from(projects).where(eq(projects.id, id)).get();
    expect(row).toMatchObject({ name: "Yeni ad", color: "sari", description: "Açıklama" });
  });
});

describe("roller", () => {
  it("rol vermeyi yalnızca yönetici yapar", async () => {
    const { id } = await team();
    await expectStatus(
      `/api/projeler/${id}`,
      (who) => ({
        intent: "set-role",
        userId: ID.can,
        role: who === "suleyman" ? "duzenleyici" : "yonetici",
      }),
      { mehmet: 403, can: 403, yabanci: 404, suleyman: 200 },
    );
    expect((await member(id, ID.can))?.role).toBe("duzenleyici");
  });

  it("rolü değişene bildirim gider", async () => {
    const { id } = await team();
    await svc().setRole(id, ID.mehmet, "yonetici");
    const rows = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.projectId, id), eq(notifications.type, "rol_degisti")));
    expect(rows.map((r) => [r.userId, r.data])).toEqual([
      [ID.mehmet, { projectName: "Ekip projesi", role: "yonetici" }],
    ]);
  });

  it("birden fazla yönetici olabilir; başka yönetici varken kendini indirebilir", async () => {
    const { id } = await team();
    await svc().setRole(id, ID.suleyman, "duzenleyici");
    expect((await member(id, ID.suleyman))?.role).toBe("duzenleyici");
  });

  it("son yönetici kendini indiremez (409, son_yonetici)", async () => {
    const res = await form(
      `/api/projeler/${EV}`,
      { intent: "set-role", userId: ID.suleyman, role: "duzenleyici" },
      jar.suleyman,
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "son_yonetici" });
    expect((await member(EV, ID.suleyman))?.role).toBe("yonetici");
  });

  it("üye olmayana rol verilemez", async () => {
    const { id } = await team();
    await expect(svc().setRole(id, ID.zeynep, "duzenleyici")).rejects.toThrow(ProjectRuleError);
  });
});

describe("üye çıkarma ve ayrılma", () => {
  it("yalnızca yönetici üye çıkarır", async () => {
    const { id } = await team();
    await expectStatus(`/api/projeler/${id}`, () => ({ intent: "remove-member", userId: ID.can }), {
      mehmet: 403,
      can: 403,
      yabanci: 404,
      suleyman: 200,
    });
    expect(await member(id, ID.can)).toBeUndefined();
  });

  it("çıkarılan üyenin görev atamaları kaldırılır, notlar ve yazar bilgisi kalır, kişiye bildirim gider", async () => {
    const { id, noteId, taskId } = await team();
    const access = await noteAccess(env, ID.mehmet, clock).forProject(id);
    await access.notes.update(noteId, { title: "Mehmet düzenledi" });
    await svc().removeMember(id, ID.mehmet);
    const assigned = await db()
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    expect(assigned.map((a) => a.userId)).toEqual([ID.can]);
    const note = await db().select().from(notes).where(eq(notes.id, noteId)).get();
    expect(note).toMatchObject({ projectId: id, updatedBy: ID.mehmet });
    const detail = await (await noteAccess(env, ID.suleyman).forNote(noteId)).notes.get(noteId);
    expect(detail.updatedBy?.name).toBe("Mehmet Kaya");
    const n = await db()
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, ID.mehmet), eq(notifications.type, "projeden_cikarildi")),
      );
    expect(n.at(-1)?.data).toEqual({ projectName: "Ekip projesi" });
    await expect(noteAccess(env, ID.mehmet).forProject(id)).rejects.toThrow(ProjectNotFoundError);
  });

  it("yönetici kendini çıkaramaz (ayrılmalı)", async () => {
    const { id } = await team();
    await expect(svc().removeMember(id, ID.suleyman)).rejects.toMatchObject({
      code: "kendini_cikaramaz",
    });
  });

  it("üye projeden ayrılabilir; atamaları kaldırılır ve projeye erişimi biter", async () => {
    const { id, taskId } = await team();
    const res = await form(`/api/projeler/${id}`, { intent: "leave" }, jar.can);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await member(id, ID.can)).toBeUndefined();
    const assigned = await db()
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    expect(assigned.map((a) => a.userId)).toEqual([ID.mehmet]);
    expect((await getJson(`/api/projeler/${id}`, jar.can)).status).toBe(404);
  });

  it("son yönetici ayrılamaz; tasarımdaki metin döner", async () => {
    const res = await form(`/api/projeler/${EV}`, { intent: "leave" }, jar.suleyman);
    expect(res).toEqual({
      status: 409,
      body: {
        ok: false,
        code: "son_yonetici",
        error:
          "Projenin son yöneticisi sensin; bu yüzden ayrılamazsın. Önce Proje ayarlarında başka bir üyeyi yönetici yap ya da projeyi sil.",
      },
    });
  });

  it("üye olmayan ayrılamaz (404)", async () => {
    const { id } = await team();
    expect((await form(`/api/projeler/${id}`, { intent: "leave" }, jar.yabanci)).status).toBe(404);
  });
});

describe("proje silme ve geri getirme", () => {
  it("yalnızca yönetici siler; düzenleyici ve görüntüleyici 403", async () => {
    const { id } = await team();
    await expectStatus(`/api/projeler/${id}`, () => ({ intent: "delete" }), {
      mehmet: 403,
      can: 403,
      yabanci: 404,
      suleyman: 200,
    });
    expect(
      (await db().select().from(projects).where(eq(projects.id, id)).get())?.deletedAt,
    ).not.toBeNull();
  });

  it("silinen proje 7 gün bekler; üyelere bildirim gider, kimse erişemez", async () => {
    const { id, noteId } = await team("Silinecek proje");
    clockNow = new Date("2026-11-07T10:00:00Z");
    await svc().softDelete(id);
    const n = await db()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.projectId, id), eq(notifications.type, "proje_silindi")));
    expect(n.map((x) => x.userId).sort()).toEqual([ID.ayse, ID.can, ID.mehmet].sort());
    for (const who of ["suleyman", "mehmet", "can"] as const) {
      expect((await getJson(`/api/projeler/${id}`, jar[who])).status).toBe(404);
      expect((await getJson(`/api/notlar/${noteId}/gorevler`, jar[who])).status).toBe(404);
      const r = await form("/api/notlar", { intent: "update", id: noteId, title: "x" }, jar[who]);
      expect(r.status).toBe(404);
    }
    expect((await svc().sidebar()).projects.map((p) => p.id)).not.toContain(id);
  });

  it("silinmiş projeler listesi yalnızca yöneticilere görünür; geri getirme yöneticiye açık", async () => {
    const { id } = await team("Geri gelecek");
    clockNow = new Date("2026-11-07T10:00:00Z");
    await svc(ID.ayse).softDelete(id);
    clockNow = new Date("2026-11-09T10:00:00Z");
    const deleted = (await svc().deleted()).find((p) => p.id === id);
    expect(deleted).toMatchObject({
      name: "Geri gelecek",
      deletedBy: { id: ID.ayse, name: "Ayşe Demir" },
      deletedByMe: false,
      daysLeft: 5,
      purgeLabel: "5 gün kaldı",
      noteCount: 1,
      memberCount: 4,
    });
    expect((await svc(ID.ayse).deleted()).find((p) => p.id === id)?.deletedByMe).toBe(true);
    expect((await svc().sidebar()).deletedCount).toBeGreaterThanOrEqual(1);
    expect(await svc(ID.mehmet).deleted()).toEqual([]);
    expect((await svc(ID.mehmet).sidebar()).deletedCount).toBe(0);

    await expect(svc(ID.mehmet).restore(id)).rejects.toThrow(ForbiddenError);
    await svc().restore(id);
    expect((await svc(ID.can).sidebar()).projects.map((p) => p.id)).toContain(id);
  });

  it("HTTP: silinmiş projeler listesi ve 'Projeyi geri getir'", async () => {
    const { id } = await team("HTTP silme");
    await form(`/api/projeler/${id}`, { intent: "delete" }, jar.suleyman);
    const list = await getJson<{ deleted: { id: string }[] }>(
      "/api/projeler?silinmis=1",
      jar.suleyman,
    );
    expect(list.body.deleted.map((p) => p.id)).toContain(id);
    expect((await form(`/api/projeler/${id}`, { intent: "restore" }, jar.mehmet)).status).toBe(403);
    expect((await form(`/api/projeler/${id}`, { intent: "restore" }, jar.suleyman)).status).toBe(
      200,
    );
    expect((await getJson(`/api/projeler/${id}`, jar.can)).status).toBe(200);
  });

  it("son yönetici projeyi silebilir", async () => {
    const { id } = await svc(ID.zeynep).create({
      name: "Tek yönetici",
      color: "yesil",
      description: null,
      emoji: null,
    });
    await svc(ID.zeynep).softDelete(id);
    expect((await svc(ID.zeynep).deleted()).map((p) => p.id)).toContain(id);
  });

  it("7 gün dolunca geri getirilemez ve cron notları, görevleri, sürümleri, üyelikleri ve davetleri kalıcı siler", async () => {
    const { id, noteId } = await team("Kalıcı silinecek");
    const keep = await team("Kalacak proje");
    await db()
      .insert(invitations)
      .values({
        id: uuid(),
        projectId: id,
        email: "zeynep@test.sukano",
        role: "duzenleyici",
        invitedBy: ID.suleyman,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      });
    clockNow = new Date("2026-11-07T10:00:00Z");
    await svc().softDelete(id);
    clockNow = new Date("2026-11-14T10:00:00Z");
    await expect(svc().restore(id)).rejects.toThrow(ProjectNotFoundError);
    expect((await svc().deleted()).map((p) => p.id)).not.toContain(id);

    await purgeDeletedProjectsOlderThanRetention(env, new Date("2026-11-14T09:59:59Z"));
    expect(await db().select().from(projects).where(eq(projects.id, id))).toHaveLength(1);
    await purgeDeletedProjects(env, clockNow);
    expect(await db().select().from(projects).where(eq(projects.id, id))).toEqual([]);
    expect(await db().select().from(notes).where(eq(notes.id, noteId))).toEqual([]);
    expect(await db().select().from(tasks).where(eq(tasks.noteId, noteId))).toEqual([]);
    expect(await db().select().from(noteVersions).where(eq(noteVersions.noteId, noteId))).toEqual(
      [],
    );
    expect(
      await db().select().from(projectMembers).where(eq(projectMembers.projectId, id)),
    ).toEqual([]);
    expect(await db().select().from(invitations).where(eq(invitations.projectId, id))).toEqual([]);
    expect(await db().select().from(notes).where(eq(notes.id, keep.noteId))).toHaveLength(1);
  });

  it("silinmemiş proje geri getirme isteği etkisizdir", async () => {
    const { id } = await team();
    await svc().restore(id);
    expect((await db().select().from(projects).where(eq(projects.id, id)).get())?.deletedAt).toBe(
      null,
    );
  });
});

describe("sayfa verileri", () => {
  it("proje sayfası: proje, rolüm, izinler, üyeler (sen önce) ve notlar", async () => {
    const page = await svc(ID.can).page(WEB);
    expect(page.project).toMatchObject({ id: WEB, name: "Web Sitesi Yenileme", color: "turuncu" });
    expect(page.myRole).toBe("goruntuleyici");
    expect(page.permissions).toEqual({ canWrite: false, canManage: false });
    expect(page.members.map((m) => m.name)).toEqual([
      "Can Yılmaz",
      "Ayşe Demir",
      "Süleyman Kara",
      "Mehmet Kaya",
      "Zeynep Arslan",
    ]);
    expect(page.members[0]).toMatchObject({ isMe: true, email: "can@test.sukano" });
    expect(page.notes.map((n) => n.id)).toContain("lansman-hazirligi");
    const archive = await svc().page(WEB, "arsiv");
    expect(archive.permissions).toEqual({ canWrite: true, canManage: true });
  });

  it("HTTP: proje sayfası, ayarlar ve üye listesi; üye olmayan 404", async () => {
    const page = await getJson<{ myRole: string }>(`/api/projeler/${WEB}?gorunum=cop`, jar.mehmet);
    expect(page).toMatchObject({ status: 200, body: { myRole: "duzenleyici" } });
    const members = await getJson<{ members: { userId: string }[] }>(
      `/api/projeler/${WEB}/uyeler`,
      jar.mehmet,
    );
    expect(members.body.members[0]!.userId).toBe(ID.mehmet);
    expect((await getJson(`/api/projeler/${WEB}`, jar.yabanci)).status).toBe(404);
    expect((await getJson(`/api/projeler/${WEB}/uyeler`, jar.yabanci)).status).toBe(404);
    expect((await getJson(`/api/projeler/${WEB}?ayarlar=1`, jar.yabanci)).status).toBe(404);
    expect((await getJson(`/api/projeler/olmayan-proje`, jar.suleyman)).status).toBe(404);
  });

  it("ayarlar: bekleyen davetler yalnızca yöneticiye; son yönetici bilgisi", async () => {
    const manager = await svc().settings("kitap-kulubu");
    expect(manager).toMatchObject({ managerCount: 1, isLastManager: true, noteCount: 1 });
    expect(manager.pendingInvites).toEqual([
      expect.objectContaining({
        email: "ayse@test.sukano",
        role: "duzenleyici",
        inviteeName: "Ayşe Demir",
        invitedByName: "Süleyman Kara",
      }),
    ]);
    const viewer = await svc(ID.zeynep).settings("kitap-kulubu");
    expect(viewer.pendingInvites).toEqual([]);
    expect(viewer.permissions.canManage).toBe(false);
    expect(viewer.isLastManager).toBe(false);
  });
});
