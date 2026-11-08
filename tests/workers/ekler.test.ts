import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { attachments, notes, projects } from "~/db/schema";
import { MAX_ATTACHMENTS_PER_NOTE } from "~/domain/attachments/rules";
import { deleteAccount } from "~/lib/account.server";
import { noteAccess } from "~/lib/note-access.server";
import { purgeExpiredTrash } from "~/lib/notes.server";
import { purgeDeletedProjectsOlderThanRetention } from "~/lib/projects.server";
import { joinNote } from "./canli-yardimcilar";
import { ORIGIN, verifiedUser } from "./kimlik-yardimcilar";
import { cookies, DAY, getJson, ID, seed, uuid, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
const access = (userId: string) => noteAccess(env, userId);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MB = 1024 * 1024;

type Who = "suleyman" | "mehmet" | "can" | "ayse" | "yabanci";
let jar: Record<Who, string>;
let stranger: { id: string; email: string; cookie: string };

beforeAll(async () => {
  await seed();
  const c = await cookies("suleyman", "mehmet", "can", "ayse");
  const v = await verifiedUser();
  const me = await db().query.user.findFirst({ where: (u, { eq }) => eq(u.email, v.email) });
  stranger = { id: me!.id, email: v.email, cookie: v.cookie };
  jar = { ...c, yabanci: v.cookie };
});

function headers(cookie: string, extra: Record<string, string> = {}) {
  return { origin: ORIGIN, cookie, "cf-connecting-ip": "203.0.113.9", ...extra };
}

async function upload(
  noteId: string,
  cookie: string,
  file: { name: string; bytes?: Uint8Array<ArrayBuffer>; size?: number; type?: string } = {
    name: "a.png",
  },
  extra: Record<string, string> = {},
) {
  const body = new FormData();
  const bytes = file.bytes ?? (file.size !== undefined ? new Uint8Array(file.size) : PNG);
  body.set("dosya", new File([bytes], file.name, { type: file.type ?? "" }));
  const res = await exports.default.fetch(`${ORIGIN}/api/notlar/${noteId}/ekler`, {
    method: "POST",
    headers: headers(cookie, extra),
    body,
    redirect: "manual",
  });
  const json = (await res.json().catch(() => null)) as {
    ok: boolean;
    error?: string;
    attachment?: { id: string; name: string; size: number; contentType: string; kind: string };
  } | null;
  return { status: res.status, body: json };
}

function download(id: string, cookie: string, query = "", extra: Record<string, string> = {}) {
  return exports.default.fetch(`${ORIGIN}/api/ekler/${id}${query}`, {
    headers: headers(cookie, extra),
    redirect: "manual",
  });
}

async function remove(id: string, cookie: string, extra: Record<string, string> = {}) {
  const res = await exports.default.fetch(`${ORIGIN}/api/ekler/${id}`, {
    method: "DELETE",
    headers: headers(cookie, extra),
    redirect: "manual",
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function personalNote(userId: string, kind: "text" | "todo" = "text") {
  const id = uuid();
  if (kind === "text") {
    await access(userId).run({
      intent: "create",
      id,
      title: "Ev tadilatı",
      bodyHtml: "<p>salon</p>",
      color: "default",
      pinned: false,
    });
  } else {
    await access(userId).run({
      intent: "create-todo",
      id,
      title: "Liste",
      color: "default",
      pinned: false,
      tasks: ["Bir"],
    });
  }
  return id;
}

async function projectNote(kind: "text" | "todo" = "text") {
  const id = uuid();
  await access(ID.suleyman).run(
    kind === "text"
      ? {
          intent: "create",
          id,
          projectId: WEB,
          title: "Proje notu",
          bodyHtml: "<p>gövde</p>",
          color: "default",
          pinned: false,
        }
      : {
          intent: "create-todo",
          id,
          projectId: WEB,
          title: "Liste",
          color: "default",
          pinned: false,
          tasks: ["Bir"],
        },
  );
  return id;
}

const rowOf = (id: string) => db().select().from(attachments).where(eq(attachments.id, id)).get();

describe("kişisel not: yükleme, listeleme, indirme, kaldırma", () => {
  it("sahibi görsel yükler; R2'ye uzantıdan gelen türle yazılır ve not detayında görünür", async () => {
    const noteId = await personalNote(ID.ayse);
    const r = await upload(noteId, jar.ayse, {
      name: "salon-ölçü.JPG",
      bytes: PNG,
      type: "text/html",
    });
    expect(r.status).toBe(201);
    expect(r.body?.attachment).toMatchObject({
      name: "salon-ölçü.JPG",
      size: PNG.length,
      contentType: "image/jpeg",
      kind: "image",
    });
    const row = await rowOf(r.body!.attachment!.id);
    expect(row?.uploadedBy).toBe(ID.ayse);
    const object = await env.FILES.get(row!.r2Key);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(PNG);
    expect(object!.httpMetadata?.contentType).toBe("image/jpeg");

    const list = await getJson<{ attachments: { id: string }[] }>(
      `/api/notlar/${noteId}/ekler`,
      jar.ayse,
    );
    expect(list.body.attachments.map((a) => a.id)).toEqual([r.body!.attachment!.id]);
    const detail = await (await access(ID.ayse).forNote(noteId)).notes.get(noteId);
    expect(detail.attachmentCount).toBe(1);
    expect(detail.attachments?.[0]?.name).toBe("salon-ölçü.JPG");
  });

  it("görsel tarayıcıda açılır; indir parametresiyle ek olarak iner; güvenlik başlıkları vardır", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse, { name: "foto.png" });
    const id = body!.attachment!.id;
    const res = await download(id, jar.ayse);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe(
      "inline; filename=\"foto.png\"; filename*=UTF-8''foto.png",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    const dl = await download(id, jar.ayse, "?indir=1");
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment; /);
    expect(dl.headers.get("content-security-policy")).toBeNull();
    await dl.arrayBuffer();
  });

  it("genel dosya her zaman ek olarak iner, Türkçe ad UTF-8 ile yazılır", async () => {
    const noteId = await personalNote(ID.ayse);
    const bytes = new TextEncoder().encode("merhaba");
    const { body } = await upload(noteId, jar.ayse, { name: "bütçe notu.txt", bytes });
    const res = await download(body!.attachment!.id, jar.ayse);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"butce notu.txt\"; filename*=UTF-8''b%C3%BCt%C3%A7e%20notu.txt",
    );
    expect(await res.text()).toBe("merhaba");
  });

  it("PDF tarayıcıda açılır ve sandbox politikası almaz", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse, { name: "teklif.pdf", size: 200 });
    const res = await download(body!.attachment!.id, jar.ayse);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline; /);
    expect(res.headers.get("content-security-policy")).toBeNull();
    await res.arrayBuffer();
  });

  it("aynı ETag ile istenen dosya 304 döner", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    const first = await download(body!.attachment!.id, jar.ayse);
    const etag = first.headers.get("etag")!;
    await first.arrayBuffer();
    const again = await download(body!.attachment!.id, jar.ayse, "", { "if-none-match": etag });
    expect(again.status).toBe(304);
  });

  it("sahibi eki kaldırır: D1 satırı ve R2 nesnesi silinir, not son düzenleme zamanı güncellenir", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    const id = body!.attachment!.id;
    const key = (await rowOf(id))!.r2Key;
    const r = await remove(id, jar.ayse);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(await rowOf(id)).toBeUndefined();
    expect(await env.FILES.head(key)).toBeNull();
    expect((await download(id, jar.ayse)).status).toBe(404);
    const note = await db().select().from(notes).where(eq(notes.id, noteId)).get();
    expect(note?.updatedBy).toBe(ID.ayse);
  });

  it("başkasının kişisel notunda her şey 404'tür (ek kimliği bilinse de)", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    const id = body!.attachment!.id;
    expect((await upload(noteId, jar.yabanci)).status).toBe(404);
    expect((await getJson(`/api/notlar/${noteId}/ekler`, jar.yabanci)).status).toBe(404);
    expect((await download(id, jar.yabanci)).status).toBe(404);
    expect((await remove(id, jar.yabanci)).status).toBe(404);
    expect((await download(id, jar.mehmet)).status).toBe(404);
    expect(await rowOf(id)).toBeDefined();
  });

  it("olmayan ek ve geçersiz kimlik 404 döner", async () => {
    expect((await download(uuid(), jar.ayse)).status).toBe(404);
    expect((await download("..%2F..%2Fetc", jar.ayse)).status).toBe(404);
    expect((await remove(uuid(), jar.ayse)).status).toBe(404);
  });

  it("oturumsuz istek girişe yönlendirilir", async () => {
    const res = await exports.default.fetch(`${ORIGIN}/api/ekler/${uuid()}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/giris/);
  });

  it("başka kökenden yükleme ve silme 403 ile reddedilir", async () => {
    const noteId = await personalNote(ID.ayse);
    const evil = { origin: "https://kotu.example" };
    expect((await upload(noteId, jar.ayse, { name: "a.png" }, evil)).status).toBe(403);
    const { body } = await upload(noteId, jar.ayse);
    expect((await remove(body!.attachment!.id, jar.ayse, evil)).status).toBe(403);
  });
});

describe("kurallar: boyut, tür, not türü, sınır", () => {
  it("10 MB'yi aşan dosya 413 ile reddedilir ve R2'ye yazılmaz", async () => {
    const noteId = await personalNote(ID.ayse);
    const r = await upload(noteId, jar.ayse, { name: "balkon.mov", size: 10 * MB + 1 });
    expect(r.status).toBe(413);
    expect(r.body?.error).toBe("10 MB · dosya başına en fazla 10 MB");
    const listed = await env.FILES.list({ prefix: `ekler/${noteId}/` });
    expect(listed.objects).toHaveLength(0);
  });

  it("tam 10 MB kabul edilir", async () => {
    const noteId = await personalNote(ID.ayse);
    expect((await upload(noteId, jar.ayse, { name: "b.zip", size: 10 * MB })).status).toBe(201);
  });

  it("çalıştırılabilir dosya 415, boş dosya 400, dosyasız istek 400 döner", async () => {
    const noteId = await personalNote(ID.ayse);
    const exe = await upload(noteId, jar.ayse, { name: "kur.exe", size: 10 });
    expect(exe).toEqual({ status: 415, body: { ok: false, error: "Bu dosya türü eklenemez" } });
    expect((await upload(noteId, jar.ayse, { name: "a.txt", size: 0 })).status).toBe(400);
    const res = await exports.default.fetch(`${ORIGIN}/api/notlar/${noteId}/ekler`, {
      method: "POST",
      headers: headers(jar.ayse),
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it("yapılacaklar notuna ek eklenemez (409)", async () => {
    const noteId = await personalNote(ID.ayse, "todo");
    const r = await upload(noteId, jar.ayse);
    expect(r).toEqual({
      status: 409,
      body: { ok: false, error: "Dosya yalnızca metin notuna eklenebilir" },
    });
  });

  it("çöpteki nota ek eklenemez ve eki kaldırılamaz (409), ama indirilebilir", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    await access(ID.ayse).run({ intent: "trash", id: noteId });
    expect((await upload(noteId, jar.ayse)).status).toBe(409);
    expect((await remove(body!.attachment!.id, jar.ayse)).status).toBe(409);
    const res = await download(body!.attachment!.id, jar.ayse);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
  });

  it(`not başına ${MAX_ATTACHMENTS_PER_NOTE} ek sınırı aşılınca 409 döner`, async () => {
    const noteId = await personalNote(ID.ayse);
    for (let i = 0; i < MAX_ATTACHMENTS_PER_NOTE; i++) {
      expect((await upload(noteId, jar.ayse, { name: `${i}.txt`, size: 3 })).status).toBe(201);
    }
    const r = await upload(noteId, jar.ayse, { name: "fazla.txt", size: 3 });
    expect(r).toEqual({
      status: 409,
      body: { ok: false, error: `Bir nota en fazla ${MAX_ATTACHMENTS_PER_NOTE} dosya eklenebilir` },
    });
  });

  it("eki olan metin notu yapılacaklara dönüştürülemez; ek kaldırılınca dönüşür", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    await expect(
      access(ID.ayse).run({ intent: "convert", id: noteId, to: "todo" }),
    ).rejects.toThrow();
    await remove(body!.attachment!.id, jar.ayse);
    await access(ID.ayse).run({ intent: "convert", id: noteId, to: "todo" });
  });
});

describe("proje notu: rol matrisi", () => {
  let noteId: string;
  let existing: string;
  beforeAll(async () => {
    noteId = await projectNote();
    existing = (await upload(noteId, jar.suleyman)).body!.attachment!.id;
  });

  it.each([
    ["suleyman", "yönetici", 201],
    ["mehmet", "düzenleyici", 201],
    ["can", "görüntüleyici", 403],
    ["yabanci", "üye olmayan", 404],
  ] as const)("%s (%s) yüklemede %i alır", async (who, _role, status) => {
    expect((await upload(noteId, jar[who])).status).toBe(status);
  });

  it.each([
    ["suleyman", 200],
    ["mehmet", 200],
    ["can", 200],
    ["yabanci", 404],
  ] as const)("%s indirmede ve listelemede %i alır", async (who, status) => {
    const res = await download(existing, jar[who]);
    expect(res.status).toBe(status);
    await res.arrayBuffer();
    expect((await getJson(`/api/notlar/${noteId}/ekler`, jar[who])).status).toBe(status);
  });

  it("görüntüleyici kaldıramaz (403), üye olmayan 404 alır, düzenleyici kaldırır", async () => {
    const id = (await upload(noteId, jar.suleyman)).body!.attachment!.id;
    expect((await remove(id, jar.can)).status).toBe(403);
    expect((await remove(id, jar.yabanci)).status).toBe(404);
    expect((await remove(id, jar.mehmet)).status).toBe(200);
  });

  it("silinmiş projenin ekleri üyelerine de 404 döner", async () => {
    const id = (await upload(noteId, jar.suleyman)).body!.attachment!.id;
    expect((await download(id, jar.ayse)).status).toBe(200);
    await db().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, WEB));
    try {
      expect((await download(id, jar.ayse)).status).toBe(404);
    } finally {
      await db().update(projects).set({ deletedAt: null }).where(eq(projects.id, WEB));
    }
  });

  it("ek eklenince not odasına ekler bildirimi gider", async () => {
    const client = await joinNote(noteId, jar.mehmet);
    try {
      await upload(noteId, jar.suleyman);
      const m = await client.waitFor((x) => x.t === "not" && "attachments" in x);
      expect(m).toMatchObject({ t: "not", by: ID.suleyman, attachments: true });
    } finally {
      client.close();
    }
  });
});

describe("kalıcı silmede R2 temizliği", () => {
  async function withFile(noteId: string, cookie: string) {
    const { body } = await upload(noteId, cookie);
    return (await rowOf(body!.attachment!.id))!.r2Key;
  }

  it("çöpten kalıcı silinen notun ekleri R2'den silinir", async () => {
    const noteId = await personalNote(ID.ayse);
    const key = await withFile(noteId, jar.ayse);
    await access(ID.ayse).run({ intent: "trash", id: noteId });
    await access(ID.ayse).run({ intent: "delete", id: noteId });
    expect(await env.FILES.head(key)).toBeNull();
  });

  it("cron çöp temizliği 7 günlük notların eklerini R2'den siler", async () => {
    const noteId = await personalNote(ID.ayse);
    const key = await withFile(noteId, jar.ayse);
    await db()
      .update(notes)
      .set({ trashedAt: new Date(Date.now() - 8 * DAY) })
      .where(eq(notes.id, noteId));
    await purgeExpiredTrash(env, new Date());
    expect(await env.FILES.head(key)).toBeNull();
    expect(await db().select().from(attachments).where(eq(attachments.noteId, noteId))).toEqual([]);
  });

  it("silinmiş proje temizliğinde proje notlarının ekleri R2'den silinir", async () => {
    const projectId = uuid();
    const create = await exports.default.fetch(`${ORIGIN}/api/projeler`, {
      method: "POST",
      headers: { ...headers(jar.suleyman), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ intent: "create", id: projectId, name: "Geçici" }).toString(),
    });
    expect(create.status).toBe(200);
    const noteId = uuid();
    await access(ID.suleyman).run({
      intent: "create",
      id: noteId,
      projectId,
      title: "x",
      bodyHtml: "",
      color: "default",
      pinned: false,
    });
    const key = await withFile(noteId, jar.suleyman);
    await db()
      .update(projects)
      .set({ deletedAt: new Date(Date.now() - 8 * DAY) })
      .where(eq(projects.id, projectId));
    await purgeDeletedProjectsOlderThanRetention(env, new Date());
    expect(await env.FILES.head(key)).toBeNull();
  });

  it("hesap silinince kişisel notların ekleri R2'den silinir", async () => {
    const personal = await personalNote(stranger.id);
    const key = await withFile(personal, stranger.cookie);
    await deleteAccount(env, stranger.id, stranger.email);
    expect(await env.FILES.head(key)).toBeNull();
  });
});

describe("kopyalama ve taşıma", () => {
  it("Kopyasını oluştur ekleri yeni R2 nesnelerine kopyalar; Geri al kopyaları siler", async () => {
    const noteId = await personalNote(ID.ayse);
    await upload(noteId, jar.ayse, { name: "a.png" });
    await upload(noteId, jar.ayse, { name: "b.txt", bytes: new TextEncoder().encode("bee") });
    const newId = uuid();
    await access(ID.ayse).run({ intent: "duplicate", id: noteId, newId });
    const src = await db().select().from(attachments).where(eq(attachments.noteId, noteId));
    const copy = await db().select().from(attachments).where(eq(attachments.noteId, newId));
    expect(copy.map((c) => c.name).sort()).toEqual(["a.png", "b.txt"]);
    expect(copy.every((c) => c.uploadedBy === ID.ayse)).toBe(true);
    const srcKeys = new Set(src.map((s) => s.r2Key));
    for (const c of copy) {
      expect(srcKeys.has(c.r2Key)).toBe(false);
      expect(c.r2Key.startsWith(`ekler/${newId}/`)).toBe(true);
      expect((await env.FILES.head(c.r2Key))?.size).toBe(c.size);
    }
    const txt = copy.find((c) => c.name === "b.txt")!;
    expect(await (await env.FILES.get(txt.r2Key))!.text()).toBe("bee");

    await access(ID.ayse).run({ intent: "discard", id: newId });
    for (const c of copy) expect(await env.FILES.head(c.r2Key)).toBeNull();
    for (const s of src) expect(await env.FILES.head(s.r2Key)).not.toBeNull();
  });

  it("Kopyala… proje notunun eklerini kişisel alana kopyalar", async () => {
    const noteId = await projectNote();
    await upload(noteId, jar.mehmet, { name: "plan.pdf", size: 50 });
    const newId = uuid();
    await access(ID.mehmet).run({ intent: "copy-to", id: noteId, newId, projectId: null });
    const copy = await db().select().from(attachments).where(eq(attachments.noteId, newId));
    expect(copy).toHaveLength(1);
    const res = await download(copy[0]!.id, jar.mehmet);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(50);
  });

  it("projeye taşınan not eklerini korur; proje üyeleri indirebilir", async () => {
    const noteId = await personalNote(ID.ayse);
    const { body } = await upload(noteId, jar.ayse);
    await access(ID.ayse).run({ intent: "move-to-project", id: noteId, projectId: WEB });
    const res = await download(body!.attachment!.id, jar.can);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
  });
});

describe("ızgara kartı", () => {
  it("kartta ilk görsel ek kapak olur ve ek sayısı gelir", async () => {
    const noteId = await personalNote(ID.ayse);
    await upload(noteId, jar.ayse, { name: "teklif.pdf", size: 20 });
    const { body } = await upload(noteId, jar.ayse, { name: "salon.png" });
    await upload(noteId, jar.ayse, { name: "ikinci.png" });
    const list = await (await access(ID.ayse).forNote(noteId)).notes.list("notlar");
    const card = list.find((n) => n.id === noteId);
    expect(card?.cover).toEqual({ id: body!.attachment!.id, name: "salon.png" });
    expect(card?.attachmentCount).toBe(3);
  });
});
