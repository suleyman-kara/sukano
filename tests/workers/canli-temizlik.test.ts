import { env, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { notes, projectMembers, projects, user } from "~/db/schema";
import type { ChannelEvent } from "~/domain/realtime/grid-events";
import type { ChannelServerMessage } from "~/domain/realtime/protocol";
import { noteAccess } from "~/lib/note-access.server";
import { projectsService } from "~/lib/projects.server";
import { purgeDeletedProjects, purgeTrashedNotes } from "../../workers/scheduled";
import { joinChannel, joinNote, type LiveClient, sleep } from "./canli-yardimcilar";
import { freshEmail, postForm, verifiedUser } from "./kimlik-yardimcilar";
import { cookies, DAY, form, ID, seed, uuid, WEB } from "./proje-yardimcilar";

/**
 * Aşama 4b sunucu boşlukları: kalıcı silmede (cron) not odasının deposu boşalır; hesap
 * silinince üyesi olunan proje kanallarına olay yayınlanır.
 */
const db = () => createDb(env.DB);
const room = (id: string) => env.NOTE_ROOM.getByName(id);
let jar: Record<"suleyman" | "mehmet" | "ayse", string>;
const open: LiveClient<unknown>[] = [];

beforeAll(async () => {
  await seed();
  jar = await cookies("suleyman", "mehmet", "ayse");
});

afterEach(() => {
  open.splice(0).forEach((c) => c.close());
});

function track<T>(c: LiveClient<T>) {
  open.push(c as LiveClient<unknown>);
  return c;
}

/** Odanın deposundaki satır sayıları (güncellemeler + meta). */
async function storedRows(id: string) {
  return runInDurableObject(room(id), (_i, state) => {
    const updates = Number(state.storage.sql.exec("SELECT count(*) AS n FROM updates").one().n);
    const meta = Number(state.storage.sql.exec("SELECT count(*) AS n FROM meta").one().n);
    return updates + meta;
  });
}

async function webTextNote(title: string, projectId = WEB, by = ID.suleyman) {
  const id = uuid();
  const { notes: svc } = await noteAccess(env, by).forProject(projectId);
  await svc.create({ id, title, bodyHtml: "<p>gövde</p>", color: "default", pinned: false });
  return id;
}

describe("kalıcı silmede not odası", () => {
  it("cron çöpü kalıcı silince açık bağlantı 4404 ile kapanır ve odanın deposu boşalır", async () => {
    const id = await webTextNote("Cron odası");
    const a = track(await joinNote(id, jar.mehmet));
    a.type("yazı ");
    await sleep(150);
    expect(await storedRows(id)).toBeGreaterThan(0);
    const t = new Date("2027-02-01T00:00:00Z");
    await db()
      .update(notes)
      .set({ trashedAt: new Date(t.getTime() - 8 * DAY) })
      .where(eq(notes.id, id));
    await purgeTrashedNotes(env, t);
    expect(await db().select().from(notes).where(eq(notes.id, id))).toEqual([]);
    await a.until(() => a.closed !== null, 3000, "kapanış");
    expect(a.closed!.code).toBe(4404);
    expect(await storedRows(id)).toBe(0);
  });

  it("silinmiş proje cron'la temizlenince notlarının odaları da boşalır", async () => {
    const project = await projectsService(env, ID.suleyman).create({
      name: "Geçici proje",
      color: "mavi",
      description: null,
      emoji: null,
    });
    const id = await webTextNote("Proje odası", project.id);
    const a = track(await joinNote(id, jar.suleyman));
    a.type("x");
    await sleep(150);
    expect(await storedRows(id)).toBeGreaterThan(0);
    const t = new Date("2027-03-01T00:00:00Z");
    await db()
      .update(projects)
      .set({ deletedAt: new Date(t.getTime() - 8 * DAY) })
      .where(eq(projects.id, project.id));
    await purgeDeletedProjects(env, t);
    expect(await db().select().from(projects).where(eq(projects.id, project.id))).toEqual([]);
    await a.until(() => a.closed !== null, 3000, "kapanış");
    expect(a.closed!.code).toBe(4404);
    expect(await storedRows(id)).toBe(0);
  });

  it("boşaltılan oda aynı kimlikle yeniden açılırsa boş tablolarla çalışır", async () => {
    const id = uuid();
    await room(id).purge();
    expect(await storedRows(id)).toBe(0);
  });
});

describe("hesap silme yayını", () => {
  it("hesap silinince üyesi olduğu proje kanalına uyelik yayınlanır, kişisel not odaları boşalır", async () => {
    const u = await verifiedUser(freshEmail("canli-silinen"));
    const id = (await db().select({ id: user.id }).from(user).where(eq(user.email, u.email)).get())!
      .id;
    await db().insert(projectMembers).values({ projectId: WEB, userId: id, role: "duzenleyici" });
    const personal = uuid();
    await noteAccess(env, id).run({
      intent: "create",
      id: personal,
      title: "Kişisel",
      bodyHtml: "<p>gizli</p>",
      color: "default",
      pinned: false,
    });

    const channel = track(await joinChannel(`/api/kanal/proje/${WEB}`, jar.mehmet));
    const own = track(await joinChannel(`/api/kanal/kisisel`, u.cookie));
    const note = track(await joinNote(personal, u.cookie));
    note.type("taslak ");
    await sleep(150);
    expect(await storedRows(personal)).toBeGreaterThan(0);

    const res = await postForm(
      "/ayarlar",
      { intent: "delete-account", email: u.email },
      { cookie: u.cookie },
    );
    expect(res.status).toBe(302);

    const m = (await channel.waitFor(
      (x) => x.t === "olay" && x.event.type === "uyelik" && x.event.userId === id,
    )) as Extract<ChannelServerMessage, { t: "olay" }>;
    expect(m.event).toMatchObject({ type: "uyelik", userId: id, by: id } satisfies Partial<
      ChannelEvent & { userId: string }
    >);
    await note.until(() => note.closed !== null, 3000, "not odası kapanışı");
    expect(note.closed!.code).toBe(4404);
    await own.until(() => own.closed !== null, 3000, "kişisel kanal kapanışı");
    expect(await storedRows(personal)).toBe(0);
  });
});

describe("taşıma", () => {
  it("kişisel not projeye taşınınca açık odaya taşındı bildirimi gider", async () => {
    const id = uuid();
    await noteAccess(env, ID.ayse).run({
      intent: "create",
      id,
      title: "Taşınacak",
      bodyHtml: "<p>t</p>",
      color: "default",
      pinned: false,
    });
    const a = track(await joinNote(id, jar.ayse));
    await form("/api/notlar", { intent: "move-to-project", id, projectId: WEB }, jar.ayse);
    expect(await a.waitFor((m) => m.t === "not" && m.moved === true)).toMatchObject({
      by: ID.ayse,
    });
  });
});
