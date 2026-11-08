import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { invitations, notifications, projectMembers, user } from "~/db/schema";
import { invitationsService, expirePendingInvitations } from "~/lib/invitations.server";
import { InvitationNotFoundError, ProjectRuleError } from "~/lib/project-access.server";
import { projectsService } from "~/lib/projects.server";
import { expireInvitations } from "../../workers/scheduled";
import { freshEmail, lastMail, register, verifiedUser } from "./kimlik-yardimcilar";
import { cookies, DAY, form, getJson, ID, KITAP, seed, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
let clockNow = new Date("2026-11-07T10:00:00Z");
const clock = () => clockNow;
const projectsOf = (userId: string = ID.suleyman) => projectsService(env, userId, clock);
const invitesOf = (userId: string) => invitationsService(env, userId, clock);

type Who = "suleyman" | "mehmet" | "can";
let jar: Record<Who, string>;

beforeAll(async () => {
  await seed();
  jar = await cookies("suleyman", "mehmet", "can");
});

async function userIdOf(email: string) {
  return (await db().select({ id: user.id }).from(user).where(eq(user.email, email)).get())!.id;
}

/** Doğrulanmış yeni hesap: e-posta, kimlik ve oturum çerezi. */
async function invitee() {
  const u = await verifiedUser(freshEmail("davetli"));
  return { ...u, id: await userIdOf(u.email) };
}

const invite = (email: string, role = "duzenleyici", cookie = jar.suleyman, project = WEB) =>
  form(`/api/projeler/${project}`, { intent: "invite", email, role }, cookie);

describe("davet gönderme: hata durumları (tasarım metinleriyle)", () => {
  it("hesap yoksa: önce hesap açması gerekiyor", async () => {
    const res = await invite("hesabi-olmayan@ornek.test");
    expect(res).toEqual({
      status: 409,
      body: {
        ok: false,
        code: "hesap_yok",
        error:
          "Bu adresle bir Sukano hesabı yok. Davet edebilmen için önce hesap açması gerekiyor.",
      },
    });
  });

  it("doğrulanmamış hesap davet alamaz", async () => {
    const email = freshEmail("dogrulanmamis");
    await register(email, { name: "Emre Kaya" });
    const res = await invite(email);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "dogrulanmamis",
      error: "Emre henüz e-postasını doğrulamadı. Doğrulayınca davet edilebilir.",
    });
  });

  it("zaten üye olan davet edilemez", async () => {
    const res = await invite("Mehmet@Test.Sukano");
    expect(res.body).toMatchObject({
      code: "zaten_uye",
      error: "Mehmet Kaya zaten bu projenin üyesi.",
    });
  });

  it("geçerli bekleyen daveti olana ikinci davet gönderilemez", async () => {
    const res = await invite("ayse@test.sukano", "goruntuleyici", jar.suleyman, KITAP);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "bekleyen_davet" });
  });

  it("geçersiz adres reddedilir", async () => {
    expect((await invite("adres-degil")).body).toMatchObject({ code: "gecersiz_eposta" });
  });

  it("yalnızca yönetici davet gönderir: düzenleyici ve görüntüleyici 403, üye olmayan 404", async () => {
    const { email } = await invitee();
    expect((await invite(email, "duzenleyici", jar.mehmet)).status).toBe(403);
    expect((await invite(email, "duzenleyici", jar.can)).status).toBe(403);
    const outsider = await invitee();
    expect((await invite(email, "duzenleyici", outsider.cookie)).status).toBe(404);
    expect(await db().select().from(invitations).where(eq(invitations.email, email))).toEqual([]);
  });
});

describe("davet yaşam döngüsü", () => {
  it("davet 14 gün geçerli yazılır; e-posta ve uygulama içi bildirim gider", async () => {
    const u = await invitee();
    const res = await invite(u.email.toUpperCase(), "goruntuleyici");
    expect(res.status).toBe(200);
    const id = res.body.invitationId as string;
    const row = await db().select().from(invitations).where(eq(invitations.id, id)).get();
    expect(row).toMatchObject({
      email: u.email,
      role: "goruntuleyici",
      status: "beklemede",
      invitedBy: ID.suleyman,
    });
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBeGreaterThanOrEqual(
      14 * DAY - 1000,
    );
    const mail = lastMail(u.email, "davet");
    expect(mail.subject).toBe(
      "Sukano: Süleyman Kara seni Web Sitesi Yenileme projesine davet etti",
    );
    expect(mail.text).toContain("görüntüleyici olarak davet etti");
    expect(new URL(mail.url!).pathname).toBe("/davetler");
    const n = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, u.id), eq(notifications.type, "davet")))
      .get();
    expect(n?.data).toEqual({
      projectName: "Web Sitesi Yenileme",
      role: "goruntuleyici",
      invitationId: id,
    });
  });

  it("davet alan Davetler'de görür ve kabul eder; davetteki rolle üye olur", async () => {
    const u = await invitee();
    const { body } = await invite(u.email, "duzenleyici");
    const list = await getJson<{
      pending: {
        id: string;
        project: { name: string };
        role: string;
        invitedBy: { name: string };
        expiryLabel: string;
      }[];
    }>("/api/davetler", u.cookie);
    expect(list.body.pending).toEqual([
      expect.objectContaining({
        id: body.invitationId,
        project: expect.objectContaining({ name: "Web Sitesi Yenileme" }),
        role: "duzenleyici",
        invitedBy: expect.objectContaining({ name: "Süleyman Kara" }),
        expiryLabel: "14 gün sonra geçersiz",
      }),
    ]);
    const res = await form(
      "/api/davetler",
      { intent: "accept", id: body.invitationId as string },
      u.cookie,
    );
    expect(res).toEqual({ status: 200, body: { ok: true, projectId: WEB } });
    const m = await db()
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, WEB), eq(projectMembers.userId, u.id)))
      .get();
    expect(m?.role).toBe("duzenleyici");
    const after = await getJson<{
      pending: unknown[];
      history: { status: string; canOpenProject: boolean }[];
    }>("/api/davetler", u.cookie);
    expect(after.body.pending).toEqual([]);
    expect(after.body.history[0]).toMatchObject({ status: "kabul_edildi", canOpenProject: true });
    expect((await getJson(`/api/projeler/${WEB}`, u.cookie)).status).toBe(200);
  });

  it("ret: üye olunmaz, davet geçmişe 'reddedildi' olarak düşer", async () => {
    const u = await invitee();
    const { body } = await invite(u.email);
    const res = await form(
      "/api/davetler",
      { intent: "decline", id: body.invitationId as string },
      u.cookie,
    );
    expect(res.status).toBe(200);
    const list = await invitesOf(u.id).list();
    expect(list.history[0]).toMatchObject({ status: "reddedildi", canOpenProject: false });
    expect((await getJson(`/api/projeler/${WEB}`, u.cookie)).status).toBe(404);
  });

  it("başkasının davetini kimse yanıtlayamaz (404)", async () => {
    const u = await invitee();
    const { body } = await invite(u.email);
    const res = await form(
      "/api/davetler",
      { intent: "accept", id: body.invitationId as string },
      jar.can,
    );
    expect(res.status).toBe(404);
    expect(
      (await form("/api/davetler", { intent: "accept", id: "olmayan" }, u.cookie)).status,
    ).toBe(404);
  });

  it("yönetici bekleyen daveti geri çekebilir; geri çekilen davet kabul edilemez", async () => {
    const u = await invitee();
    const { body } = await invite(u.email);
    const id = body.invitationId as string;
    expect(
      (
        await form(
          `/api/projeler/${WEB}`,
          { intent: "revoke-invite", invitationId: id },
          jar.mehmet,
        )
      ).status,
    ).toBe(403);
    const res = await form(
      `/api/projeler/${WEB}`,
      { intent: "revoke-invite", invitationId: id },
      jar.suleyman,
    );
    expect(res.status).toBe(200);
    const accept = await form("/api/davetler", { intent: "accept", id }, u.cookie);
    expect(accept).toMatchObject({ status: 409, body: { code: "gecersiz_davet" } });
    const again = await form(
      `/api/projeler/${WEB}`,
      { intent: "revoke-invite", invitationId: id },
      jar.suleyman,
    );
    expect(again.status).toBe(409);
    expect((await invitesOf(u.id).list()).history[0]?.status).toBe("geri_cekildi");
  });

  it("14 gün sonra davet geçersizdir: kabul edilemez, geçmişte 'süresi doldu' görünür", async () => {
    const u = await invitee();
    clockNow = new Date("2026-11-07T10:00:00Z");
    const { invitationId } = await projectsOf().invite(WEB, u.email, "duzenleyici");
    clockNow = new Date("2026-11-21T09:59:59Z");
    expect((await invitesOf(u.id).list()).pending[0]?.expiryLabel).toBe("yarın geçersiz");
    clockNow = new Date("2026-11-21T10:00:00Z");
    await expect(invitesOf(u.id).accept(invitationId)).rejects.toMatchObject({
      code: "suresi_doldu",
      message: "Bu davetin süresi doldu.",
    });
    const list = await invitesOf(u.id).list();
    expect(list.pending).toEqual([]);
    expect(list.history[0]).toMatchObject({ id: invitationId, status: "suresi_doldu" });
  });

  it("süresi dolan davetin yerine yenisi gönderilebilir; eskisi 'süresi doldu' olur", async () => {
    const u = await invitee();
    clockNow = new Date("2026-11-07T10:00:00Z");
    const first = await projectsOf().invite(WEB, u.email, "goruntuleyici");
    clockNow = new Date("2026-11-30T10:00:00Z");
    const second = await projectsOf().invite(WEB, u.email, "duzenleyici");
    const rows = await db().select().from(invitations).where(eq(invitations.email, u.email));
    expect(rows.find((r) => r.id === first.invitationId)?.status).toBe("suresi_doldu");
    expect(rows.find((r) => r.id === second.invitationId)?.status).toBe("beklemede");
    await invitesOf(u.id).accept(second.invitationId);
  });

  it("cron süresi dolan bekleyen davetleri işaretler", async () => {
    const u = await invitee();
    clockNow = new Date("2026-11-07T10:00:00Z");
    const { invitationId } = await projectsOf().invite(WEB, u.email, "duzenleyici");
    expect(await expirePendingInvitations(env, new Date("2026-11-21T09:00:00Z"))).toBe(0);
    await expireInvitations(env, new Date("2026-11-21T10:00:00Z"));
    const row = await db().select().from(invitations).where(eq(invitations.id, invitationId)).get();
    expect(row?.status).toBe("suresi_doldu");
  });

  it("silinmiş projenin daveti gizlenir ve kabul edilemez", async () => {
    const u = await invitee();
    const { id: projectId } = await projectsOf(ID.zeynep).create({
      name: "Silinecek davetli proje",
      color: "pembe",
      description: null,
      emoji: null,
    });
    clockNow = new Date("2026-11-07T10:00:00Z");
    const { invitationId } = await projectsOf(ID.zeynep).invite(projectId, u.email, "duzenleyici");
    await projectsOf(ID.zeynep).softDelete(projectId);
    expect((await invitesOf(u.id).list()).pending).toEqual([]);
    await expect(invitesOf(u.id).accept(invitationId)).rejects.toThrow(ProjectRuleError);
  });

  it("e-postası doğrulanmamış hesap bekleyen davetlerini görmez", async () => {
    const email = freshEmail("dogrulanmamis");
    await register(email, { name: "Ece" });
    const id = await userIdOf(email);
    await db()
      .insert(invitations)
      .values({
        id: crypto.randomUUID(),
        projectId: WEB,
        email,
        role: "duzenleyici",
        invitedBy: ID.suleyman,
        expiresAt: new Date(Date.now() + DAY),
      });
    expect((await invitationsService(env, id).list()).pending).toEqual([]);
  });

  it("tohumdaki bekleyen davet: Ayşe Kitap Kulübü davetini görür", async () => {
    const list = await invitationsService(env, ID.ayse).list();
    expect(list.pending.map((p) => p.project.id)).toEqual([KITAP]);
    await expect(invitationsService(env, ID.mehmet).decline(list.pending[0]!.id)).rejects.toThrow(
      InvitationNotFoundError,
    );
  });

  it("geçersiz form 400", async () => {
    expect((await form("/api/davetler", { intent: "sil", id: "x" }, jar.can)).status).toBe(400);
    expect(
      (
        await form(
          `/api/projeler/${WEB}`,
          { intent: "invite", email: "a@b.co", role: "patron" },
          jar.suleyman,
        )
      ).status,
    ).toBe(400);
  });
});
