import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { invitations, notes, projectMembers, session, taskAssignees, user } from "~/db/schema";
import { accountDeletionBlockers, deleteAccount } from "~/lib/account.server";
import { noteAccess } from "~/lib/note-access.server";
import { ProjectRuleError } from "~/lib/project-access.server";
import { projectsService } from "~/lib/projects.server";
import { freshEmail, postForm, sessionOf, verifiedUser } from "./kimlik-yardimcilar";
import { ID, KITAP, seed, uuid, WEB, EV } from "./proje-yardimcilar";

const db = () => createDb(env.DB);

beforeAll(async () => {
  await seed();
});

async function userIdOf(email: string) {
  return (await db().select({ id: user.id }).from(user).where(eq(user.email, email)).get())!.id;
}

/**
 * Silinecek hesap: kişisel not, Web projesinde düzenleyici (proje notu yazmış, göreve
 * atanmış), kendi açtığı ve ikinci yöneticisi olan bir proje, bekleyen bir davet.
 */
async function doomedAccount() {
  const u = await verifiedUser(freshEmail("silinecek"));
  const id = await userIdOf(u.email);
  const access = noteAccess(env, id);
  const personal = uuid();
  await access.run({
    intent: "create",
    id: personal,
    title: "Gizli not",
    bodyHtml: "<p>x</p>",
    color: "default",
    pinned: false,
  });
  await db().insert(projectMembers).values({ projectId: WEB, userId: id, role: "duzenleyici" });
  const projectNote = uuid();
  await access.run({
    intent: "create-todo",
    id: projectNote,
    title: "Silinen kullanıcının listesi",
    color: "default",
    pinned: false,
    tasks: ["Bir"],
    projectId: WEB,
  });
  const svc = (await access.forNote(projectNote)).tasks;
  const { tasks } = await svc.state(projectNote);
  await svc.apply(projectNote, [{ op: "assign", id: tasks[0]!.id, userIds: [id, ID.mehmet] }]);
  const own = await projectsService(env, id).create({
    name: "Ortak yönetim",
    color: "mavi",
    description: null,
    emoji: null,
  });
  await db()
    .insert(projectMembers)
    .values({ projectId: own.id, userId: ID.ayse, role: "yonetici" });
  await db()
    .insert(invitations)
    .values({
      id: uuid(),
      projectId: KITAP,
      email: u.email,
      role: "goruntuleyici",
      invitedBy: ID.suleyman,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  return { ...u, id, personal, projectNote, taskId: tasks[0]!.id, ownProject: own.id };
}

describe("hesap silme", () => {
  it("tek yönetici olunan projeler engeldir; projeler adıyla söylenir", async () => {
    const blockers = await accountDeletionBlockers(env, ID.suleyman);
    expect(blockers.map((b) => b.id).sort()).toEqual([EV, KITAP].sort());
    await expect(deleteAccount(env, ID.suleyman, "suleyman@test.sukano")).rejects.toMatchObject({
      code: "tek_yonetici",
    });
    const err = await deleteAccount(env, ID.suleyman, "suleyman@test.sukano").catch((e) => e);
    expect(err).toBeInstanceOf(ProjectRuleError);
    expect((err as Error).message).toMatch(
      /^Tek yönetici olduğun projeleri önce devretmen ya da silmen gerekir: .*Ev Taşınma/,
    );
    expect(await db().select().from(user).where(eq(user.id, ID.suleyman))).toHaveLength(1);
  });

  it("başka yöneticisi olan proje engel değildir", async () => {
    expect(await accountDeletionBlockers(env, ID.ayse)).toEqual([]);
  });

  it("HTTP: tek yönetici ya da yanlış e-posta ile istek 409 döner, hesap kalır", async () => {
    const u = await doomedAccount();
    const wrong = await postForm(
      "/ayarlar",
      { intent: "delete-account", email: "baska@ornek.test" },
      { cookie: u.cookie },
    );
    expect(wrong.status).toBe(409);
    expect(await db().select().from(user).where(eq(user.id, u.id))).toHaveLength(1);
    expect((await sessionOf(u.cookie))?.user.email).toBe(u.email);
  });

  it("HTTP: e-posta yazılarak onaylanır; kişisel notlar silinir, proje notları 'silinmiş kullanıcı' ile kalır", async () => {
    const u = await doomedAccount();
    const res = await postForm(
      "/ayarlar",
      { intent: "delete-account", email: ` ${u.email.toUpperCase()} ` },
      { cookie: u.cookie },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/giris?durum=hesap-silindi");

    expect(await db().select().from(user).where(eq(user.id, u.id))).toEqual([]);
    expect(await db().select().from(session).where(eq(session.userId, u.id))).toEqual([]);
    expect(await sessionOf(u.cookie)).toBeNull();
    expect(await db().select().from(notes).where(eq(notes.id, u.personal))).toEqual([]);

    const row = await db().select().from(notes).where(eq(notes.id, u.projectNote)).get();
    expect(row).toMatchObject({ projectId: WEB, createdBy: null, updatedBy: null });
    const detail = await (
      await noteAccess(env, ID.mehmet).forNote(u.projectNote)
    ).notes.get(u.projectNote);
    expect(detail.createdBy).toBeNull();
    expect(detail.assignees[u.taskId]).toEqual([ID.mehmet]);

    expect(
      await db()
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, WEB), eq(projectMembers.userId, u.id))),
    ).toEqual([]);
    expect(await db().select().from(taskAssignees).where(eq(taskAssignees.userId, u.id))).toEqual(
      [],
    );
    const own = await projectsService(env, ID.ayse).settings(u.ownProject);
    expect(own.members.map((m) => m.userId)).toEqual([ID.ayse]);
    const inv = await db().select().from(invitations).where(eq(invitations.email, u.email));
    expect(inv.map((i) => i.status)).toEqual(["geri_cekildi"]);
  });
});
