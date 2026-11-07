import { env, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChannelEvent } from "~/domain/realtime/grid-events";
import type { ChannelServerMessage } from "~/domain/realtime/protocol";
import { noteAccess } from "~/lib/note-access.server";
import { joinChannel, joinNote, type LiveClient, sleep } from "./canli-yardimcilar";
import { cookies, EV, form, ID, ops, seed, uuid, WEB } from "./proje-yardimcilar";

type Who = "suleyman" | "mehmet" | "can" | "ayse";
let jar: Record<Who, string>;
const open: LiveClient<unknown>[] = [];

beforeAll(async () => {
  await seed();
  jar = await cookies("suleyman", "mehmet", "can", "ayse");
});

afterEach(() => {
  open.splice(0).forEach((c) => c.close());
});

async function channel(path: string, who: Who) {
  const c = await joinChannel(path, jar[who]);
  open.push(c as LiveClient<unknown>);
  return c;
}

const project = (who: Who, id = WEB) => channel(`/api/kanal/proje/${id}`, who);
const personal = (who: Who) => channel(`/api/kanal/kisisel`, who);

/** Kanalda belirtilen türde olay gelene kadar bekler. */
async function event(c: LiveClient<ChannelServerMessage>, type: ChannelEvent["type"]) {
  const m = await c.waitFor((x) => x.t === "olay" && x.event.type === type);
  return (m as Extract<ChannelServerMessage, { t: "olay" }>).event;
}

async function projectNote(kind: "text" | "todo" = "text") {
  const id = uuid();
  const { notes: svc, tasks } = await noteAccess(env, ID.suleyman).forProject(WEB);
  if (kind === "text")
    await svc.create({ id, title: "Kanal", bodyHtml: "<p>k</p>", color: "default", pinned: false });
  else await tasks.createTodo({ id, title: "L", color: "default", pinned: false, tasks: ["A"] });
  return id;
}

describe("proje kanalı", () => {
  it("not eylemleri D1'e yazıldıktan sonra tüm üyelere (görüntüleyici dahil) yayınlanır", async () => {
    const viewer = await project("can");
    const editor = await project("mehmet");
    const id = uuid();
    await form(
      "/api/notlar",
      { intent: "create", id, projectId: WEB, title: "Yeni" },
      jar.suleyman,
    );
    expect(await event(viewer, "olusturuldu")).toMatchObject({ noteId: id, by: ID.suleyman });
    await form("/api/notlar", { intent: "color", id, color: "yesil" }, jar.mehmet);
    expect(await event(viewer, "renk")).toMatchObject({
      noteId: id,
      color: "yesil",
      by: ID.mehmet,
    });
    await form("/api/notlar", { intent: "pin", id, pinned: "true" }, jar.suleyman);
    expect(await event(editor, "sabit")).toMatchObject({ noteId: id, pinned: true });
    await form("/api/notlar", { intent: "move", id, pinned: "true", toIndex: "0" }, jar.suleyman);
    expect(await event(editor, "sira")).toMatchObject({ noteId: id, toIndex: 0 });
    await form("/api/notlar", { intent: "archive", id }, jar.suleyman);
    expect(await event(viewer, "arsivlendi")).toMatchObject({ noteId: id });
    await form("/api/notlar", { intent: "unarchive", id }, jar.suleyman);
    await event(viewer, "arsivden-cikti");
    await form("/api/notlar", { intent: "trash", id }, jar.suleyman);
    await event(viewer, "cope-atildi");
    await form("/api/notlar", { intent: "restore", id }, jar.suleyman);
    await event(viewer, "geri-yuklendi");
    const copy = uuid();
    await form("/api/notlar", { intent: "duplicate", id, newId: copy }, jar.suleyman);
    await viewer.until(
      () =>
        viewer.json.some(
          (m) => m.t === "olay" && m.event.type === "olusturuldu" && m.event.noteId === copy,
        ),
      3000,
      "kopya olayı",
    );
    await form("/api/notlar", { intent: "update", id, title: "Başlık" }, jar.suleyman);
    expect(await event(viewer, "icerik")).toMatchObject({ noteId: id });
    await form("/api/notlar", { intent: "trash", id }, jar.suleyman);
    await form("/api/notlar", { intent: "empty-trash", projectId: WEB }, jar.suleyman);
    expect(await event(viewer, "silindi")).toMatchObject({ noteIds: expect.arrayContaining([id]) });
    // Sıra numaraları artar.
    const seqs = viewer.json.filter((m) => m.t === "olay").map((m) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("reddedilen eylem yayınlanmaz", async () => {
    const id = await projectNote();
    const c = await project("mehmet");
    expect(
      (await form("/api/notlar", { intent: "color", id, color: "mavi" }, jar.can)).status,
    ).toBe(403);
    await sleep(150);
    expect(c.json.filter((m) => m.t === "olay")).toEqual([]);
  });

  it("görev işlemleri kanala içerik olayı olarak gelir", async () => {
    const id = await projectNote("todo");
    const c = await project("can");
    const { tasks } = await noteAccess(env, ID.suleyman).forNote(id);
    const taskId = (await tasks.state(id)).tasks[0]!.id;
    expect((await ops(id, [{ op: "complete", id: taskId }], jar.mehmet)).status).toBe(200);
    expect(await event(c, "icerik")).toMatchObject({ noteId: id, by: ID.mehmet });
  });

  it("metin notunun D1 yazımı kanala içerik olayı yayınlar", async () => {
    const id = await projectNote();
    const c = await project("can");
    const n = await joinNote(id, jar.mehmet);
    open.push(n as LiveClient<unknown>);
    n.type("canlı ");
    await sleep(150);
    await runDurableObjectAlarm(env.NOTE_ROOM.getByName(id));
    expect(await event(c, "icerik")).toMatchObject({ noteId: id, by: ID.mehmet });
  });

  it("kişisel not projeye taşınınca kişisel kanalda ayrılır, proje kanalında belirir", async () => {
    const mine = await personal("suleyman");
    const proj = await project("can");
    const id = uuid();
    await form("/api/notlar", { intent: "create", id, title: "Taşınacak" }, jar.suleyman);
    expect(await event(mine, "olusturuldu")).toMatchObject({ noteId: id });
    await form("/api/notlar", { intent: "move-to-project", id, projectId: WEB }, jar.suleyman);
    expect(await event(mine, "tasindi")).toMatchObject({ noteId: id });
    expect(await event(proj, "olusturuldu")).toMatchObject({ noteId: id });
    await form("/api/notlar", { intent: "undo-move", id }, jar.suleyman);
    await mine.until(
      () => mine.json.filter((m) => m.t === "olay" && m.event.type === "olusturuldu").length === 2,
      3000,
      "geri dönüş",
    );
    await event(proj, "tasindi");
  });

  it("kişisel kanal yalnızca sahibine yayın yapar", async () => {
    const other = await personal("mehmet");
    await form("/api/notlar", { intent: "create", id: uuid(), title: "Benim" }, jar.suleyman);
    await sleep(150);
    expect(other.json.filter((m) => m.t === "olay")).toEqual([]);
  });

  it("proje bilgisi değişince ve rol değişince olay gelir; çıkarılanın bağlantısı kapanır", async () => {
    const c = await project("suleyman", EV);
    const ayse = await project("ayse", EV);
    await form(
      `/api/projeler/${EV}`,
      { intent: "update", description: "Yeni açıklama" },
      jar.suleyman,
    );
    await event(c, "proje");
    await form(
      `/api/projeler/${EV}`,
      { intent: "set-role", userId: ID.ayse, role: "goruntuleyici" },
      jar.suleyman,
    );
    expect(await event(c, "uyelik")).toMatchObject({ userId: ID.ayse });
    await form(`/api/projeler/${EV}`, { intent: "remove-member", userId: ID.ayse }, jar.suleyman);
    await ayse.until(() => ayse.closed !== null, 3000, "kapanış");
    expect(ayse.closed!.code).toBe(4404);
  });
});
