import { env } from "cloudflare:test";
import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "~/db/client";
import { notifications, pushSubscriptions, reminders, userPreferences } from "~/db/schema";
import { base64UrlEncode } from "~/domain/notifications/web-push";
import { deliverPendingNotifications } from "~/lib/notifications.server";
import { dispatchDueReminders, runReminderJob } from "~/lib/reminders.server";
import { sendDueReminders } from "../../workers/scheduled";
import { freshEmail, get, lastMail, postForm, postJson, verifiedUser } from "./kimlik-yardimcilar";
import { cookies, form, getJson, ID, ops, seed, WEB } from "./proje-yardimcilar";

const db = () => createDb(env.DB);
type Who = "suleyman" | "ayse" | "mehmet" | "zeynep" | "can";
let jar: Record<Who, string>;

beforeAll(async () => {
  await seed();
  jar = await cookies("suleyman", "ayse", "mehmet", "zeynep", "can");
});

beforeEach(async () => {
  // Her test kendi bildirimleriyle başlar.
  await db().delete(notifications);
  await db().delete(reminders);
  await db().delete(pushSubscriptions);
});

const LANSMAN = "lansman-hazirligi";
const MARKET = "market"; // Süleyman'ın kişisel notu
const remind = (fields: Record<string, string>, cookie: string) =>
  form("/api/hatirlaticilar", fields, cookie);
const notificationsOf = (userId: string) =>
  db().select().from(notifications).where(eq(notifications.userId, userId));
const reminderNotifications = () =>
  db().select().from(notifications).where(eq(notifications.type, "hatirlatici"));

/** Sahte push hizmeti: uç noktaya göre durum kodu döner, istekleri kaydeder. */
function fakePush(statusFor: (url: string) => number = () => 201) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return new Response(null, { status: statusFor(url) });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** Tarayıcının üreteceği biçimde geçerli bir abonelik (gerçek P-256 anahtarı). */
async function subscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  return {
    endpoint,
    keys: {
      p256dh: base64UrlEncode(raw),
      auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
    },
  };
}

async function subscribe(cookie: string, endpoint: string) {
  const res = await postJson("/api/push/abonelik", await subscription(endpoint), { cookie });
  expect(res.status).toBe(200);
}

describe("not hatırlatıcısı kurma", () => {
  it("kişisel not hatırlatıcısı kişinin saat diliminde yorumlanır ve kaldırılabilir", async () => {
    const res = await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    expect(res).toEqual({ status: 200, body: { ok: true, at: "2026-11-20T06:00:00.000Z" } });
    const berlin = await remind(
      {
        intent: "note",
        noteId: MARKET,
        date: "2026-11-20",
        time: "09:00",
        timeZone: "Europe/Berlin",
      },
      jar.suleyman,
    );
    expect(berlin.body.at).toBe("2026-11-20T08:00:00.000Z");
    // Saat dilimi saklandı.
    const pref = await db()
      .select({ tz: userPreferences.timeZone })
      .from(userPreferences)
      .where(eq(userPreferences.userId, ID.suleyman))
      .get();
    expect(pref?.tz).toBe("Europe/Berlin");
    const clear = await remind({ intent: "note-clear", noteId: MARKET }, jar.suleyman);
    expect(clear.body).toEqual({ ok: true, at: null });
    expect(await db().select().from(reminders)).toHaveLength(0);
    await db().update(userPreferences).set({ timeZone: "Europe/Istanbul" });
  });

  it("görüntüleyici kuramaz (403), üye olmayan ve başkasının kişisel notu 404", async () => {
    const fields = { intent: "note", noteId: LANSMAN, date: "2026-11-20", time: "09:00" };
    expect((await remind(fields, jar.can)).status).toBe(403);
    expect((await remind({ ...fields, noteId: MARKET }, jar.ayse)).status).toBe(404);
    expect((await remind(fields, jar.mehmet)).status).toBe(200);
  });

  it("geçersiz tarih 400, oturumsuz istek giriş sayfasına gider", async () => {
    const bad = await remind(
      { intent: "note", noteId: MARKET, date: "2026-13-01", time: "09:00" },
      jar.suleyman,
    );
    expect(bad).toEqual({ status: 400, body: { ok: false, error: "Geçerli bir tarih seç" } });
    const res = await postForm("/api/hatirlaticilar", { intent: "note-clear", noteId: MARKET });
    expect(res.status).toBe(302);
  });
});

describe("cron: zamanı gelen hatırlatıcılar", () => {
  it("kişisel not hatırlatıcısı bir kez çalar: cron iki kez koşsa da tek bildirim", async () => {
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    const before = await dispatchDueReminders(env, new Date("2026-11-20T05:59:00Z"));
    expect(before.claimed).toBe(0);

    const now = new Date("2026-11-20T06:00:30Z");
    const first = await runReminderJob(env, now, fakePush().impl);
    const second = await runReminderJob(env, now, fakePush().impl);
    expect(first).toMatchObject({ claimed: 1, notified: 1 });
    expect(second).toMatchObject({ claimed: 0, notified: 0, delivered: 0 });

    const rows = await reminderNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: ID.suleyman,
      noteId: MARKET,
      projectId: null,
      readAt: null,
    });
    expect(rows[0]!.data).toMatchObject({ targetType: "note", noteTitle: "Market" });
    expect(rows[0]!.deliveredAt).not.toBeNull();
    const rem = await db().select().from(reminders).get();
    expect(rem?.sentAt?.getTime()).toBe(now.getTime());
  });

  it("aynı anda koşan iki cron hatırlatıcıyı yalnızca bir kez alır", async () => {
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    const now = new Date("2026-11-21T00:00:00Z");
    const [a, b] = await Promise.all([
      dispatchDueReminders(env, now),
      dispatchDueReminders(env, now),
    ]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(await reminderNotifications()).toHaveLength(1);
  });

  it("proje notu hatırlatıcısı projedeki herkese gider", async () => {
    await remind({ intent: "note", noteId: LANSMAN, date: "2026-11-20", time: "09:00" }, jar.ayse);
    await dispatchDueReminders(env, new Date("2026-11-20T07:00:00Z"));
    const rows = await reminderNotifications();
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [ID.suleyman, ID.ayse, ID.mehmet, ID.zeynep, ID.can].sort(),
    );
    expect(rows.every((r) => r.projectId === WEB && r.noteId === LANSMAN)).toBe(true);
  });

  it("görev hatırlatıcısı atananlara gider; atanan yoksa kurana", async () => {
    // "Lansman duyurusu": Ayşe ve Can'a atanmış, 24 Kas 10:00.
    const duyuru = await remind(
      { intent: "task", noteId: LANSMAN, taskId: `${LANSMAN}-g4`, on: "1" },
      jar.mehmet,
    );
    expect(duyuru.body).toEqual({ ok: true, at: "2026-11-24T07:00:00.000Z" });
    // Atanmamış göreve tarih ver ve hatırlat.
    const id = crypto.randomUUID();
    await ops(
      LANSMAN,
      [
        {
          op: "create",
          id,
          parentId: null,
          position: -1,
          title: "Basın bülteni",
          dueDate: "2026-11-24",
        },
      ],
      jar.zeynep,
    );
    const bulten = await remind(
      { intent: "task", noteId: LANSMAN, taskId: id, on: "1" },
      jar.zeynep,
    );
    expect(bulten.body.at).toBe("2026-11-24T06:00:00.000Z"); // saat yok → 09:00

    await dispatchDueReminders(env, new Date("2026-11-24T08:00:00Z"));
    const rows = await reminderNotifications();
    const byTask = (taskId: string) =>
      rows
        .filter((r) => r.data.taskId === taskId)
        .map((r) => r.userId)
        .sort();
    expect(byTask(`${LANSMAN}-g4`)).toEqual([ID.ayse, ID.can].sort());
    expect(byTask(id)).toEqual([ID.zeynep]);
    expect(rows.find((r) => r.data.taskId === id)?.data).toMatchObject({
      targetType: "task",
      taskTitle: "Basın bülteni",
      noteTitle: "Lansman hazırlığı",
    });
  });

  it("bitiş tarihi değişince görev hatırlatıcısı yeniden hesaplanır, tarih kalkınca silinir", async () => {
    const taskId = `${LANSMAN}-g3`; // SEO kontrolleri, 20 Kas
    await remind({ intent: "task", noteId: LANSMAN, taskId, on: "1" }, jar.ayse);
    await ops(
      LANSMAN,
      [{ op: "update", id: taskId, dueDate: "2026-11-27", dueTime: "15:30" }],
      jar.mehmet,
    );
    const row = await db().select().from(reminders).where(eq(reminders.targetId, taskId)).get();
    expect(row?.at.toISOString()).toBe("2026-11-27T12:30:00.000Z");
    await ops(LANSMAN, [{ op: "update", id: taskId, dueDate: null }], jar.mehmet);
    expect(await db().select().from(reminders).where(eq(reminders.targetId, taskId))).toHaveLength(
      0,
    );
    // Bitiş tarihi olmayan görevde hatırlatıcı açılamaz.
    const res = await remind({ intent: "task", noteId: LANSMAN, taskId, on: "1" }, jar.ayse);
    expect(res).toEqual({
      status: 409,
      body: { ok: false, error: "Hatırlatmak için önce bitiş tarihi ver" },
    });
  });

  it("tamamlanan görevin ve çöpteki notun hatırlatıcısı gönderilmeden kapanır", async () => {
    const taskId = `${LANSMAN}-g2`;
    await remind({ intent: "task", noteId: LANSMAN, taskId, on: "1" }, jar.ayse);
    await ops(LANSMAN, [{ op: "complete", id: taskId }], jar.ayse);
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    await form("/api/notlar", { intent: "trash", id: MARKET }, jar.suleyman);
    const res = await dispatchDueReminders(env, new Date("2026-12-01T00:00:00Z"));
    expect(res).toMatchObject({ claimed: 2, skipped: 2, notified: 0 });
    expect(await reminderNotifications()).toHaveLength(0);
    await form("/api/notlar", { intent: "restore", id: MARKET }, jar.suleyman);
    await ops(LANSMAN, [{ op: "uncomplete", id: taskId }], jar.ayse);
  });

  it("workers/scheduled sendDueReminders hatırlatıcı işini çalıştırır", async () => {
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    await sendDueReminders(env, new Date("2026-11-20T06:01:00Z"));
    expect(await reminderNotifications()).toHaveLength(1);
  });
});

describe("Web Push", () => {
  it("abonelik kaydedilir, aynı uç nokta güncellenir ve silinir", async () => {
    const endpoint = "https://push.example/abc";
    await subscribe(jar.ayse, endpoint);
    await subscribe(jar.ayse, endpoint);
    expect(await db().select().from(pushSubscriptions)).toHaveLength(1);
    const info = await getJson<{ publicKey: string; subscribed: boolean }>(
      `/api/push/abonelik?endpoint=${encodeURIComponent(endpoint)}`,
      jar.ayse,
    );
    expect(info.body.subscribed).toBe(true);
    expect(info.body.publicKey).toMatch(/^B/);
    // Başkası silemez.
    const del = await env_fetch_delete(jar.can, endpoint);
    expect(del).toEqual({ ok: true, removed: false });
    expect(await env_fetch_delete(jar.ayse, endpoint)).toEqual({ ok: true, removed: true });
    expect(await db().select().from(pushSubscriptions)).toHaveLength(0);
  });

  it("geçersiz abonelik reddedilir (http uç nokta, kısa anahtar), JSON değilse 415", async () => {
    const sub = await subscription("http://push.example/x");
    expect((await postJson("/api/push/abonelik", sub, { cookie: jar.ayse })).status).toBe(400);
    const short = { endpoint: "https://push.example/x", keys: { p256dh: "abc", auth: "def" } };
    expect((await postJson("/api/push/abonelik", short, { cookie: jar.ayse })).status).toBe(400);
    const res = await form("/api/push/abonelik", { endpoint: "x" }, jar.ayse);
    expect(res.status).toBe(415);
  });

  it("hatırlatıcı push'u şifreli gider; 410 ve 404 dönen abonelik silinir", async () => {
    await subscribe(jar.suleyman, "https://push.example/canli");
    await subscribe(jar.suleyman, "https://push.example/gitti");
    await subscribe(jar.suleyman, "https://push.example/yok");
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    const push = fakePush((url) => (url.endsWith("gitti") ? 410 : url.endsWith("yok") ? 404 : 201));
    const res = await runReminderJob(env, new Date("2026-11-20T06:00:00Z"), push.impl);
    expect(res).toMatchObject({ notified: 1, delivered: 1, pushed: 1, removed: 2 });
    expect(push.calls).toHaveLength(3);
    const headers = push.calls[0]!.init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=B/);
    expect(headers.Urgency).toBe("high");
    const left = await db()
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions);
    expect(left.map((s) => s.endpoint)).toEqual(["https://push.example/canli"]);
  });

  it("tercih kapalıysa push gitmez ama uygulama içi bildirim yazılır", async () => {
    await subscribe(jar.suleyman, "https://push.example/s1");
    const off = await form(
      "/api/bildirimler",
      { intent: "pref", key: "push.hatirlatici", value: "0" },
      jar.suleyman,
    );
    expect(off.body).toMatchObject({ ok: true, prefs: { push: { hatirlatici: false } } });
    await remind(
      { intent: "note", noteId: MARKET, date: "2026-11-20", time: "09:00" },
      jar.suleyman,
    );
    const push = fakePush();
    await runReminderJob(env, new Date("2026-11-20T06:00:00Z"), push.impl);
    expect(push.calls).toHaveLength(0);
    expect(await reminderNotifications()).toHaveLength(1);
    await form(
      "/api/bildirimler",
      { intent: "pref", key: "push.hatirlatici", value: "1" },
      jar.suleyman,
    );
  });

  it("göreve atanma bildirimi atanana push olarak gider (atayan kendine bildirim almaz)", async () => {
    await subscribe(jar.zeynep, "https://push.example/zeynep");
    const res = await ops(
      LANSMAN,
      [{ op: "assign", id: `${LANSMAN}-g1`, userIds: [ID.mehmet, ID.zeynep] }],
      jar.zeynep,
    );
    expect(res.status).toBe(200);
    // İstek sonrası dağıtım (waitUntil) testte beklenmez; elle dağıt.
    const push = fakePush();
    const result = await deliverPendingNotifications(env, new Date(), push.impl);
    const rows = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "goreve_atandi"));
    expect(rows.map((r) => r.userId)).toEqual([ID.mehmet]);
    expect(result.pushed).toBe(0); // Mehmet'in aboneliği yok
    await ops(LANSMAN, [{ op: "assign", id: `${LANSMAN}-g1`, userIds: [] }], jar.zeynep);
  });

  it("VAPID anahtarları yoksa push sessizce atlanır", async () => {
    await subscribe(jar.suleyman, "https://push.example/s2");
    await db().insert(notifications).values({ userId: ID.suleyman, type: "davet", data: {} });
    const push = fakePush();
    const res = await deliverPendingNotifications(
      { DB: env.DB, PROJECT_ROOM: env.PROJECT_ROOM, NOTE_ROOM: env.NOTE_ROOM },
      new Date(),
      push.impl,
    );
    expect(res).toMatchObject({ delivered: 1, pushed: 0 });
    expect(push.calls).toHaveLength(0);
  });
});

describe("davet e-postası tercihi", () => {
  it("davet e-postası kapalıysa e-posta gitmez, uygulama içi davet ve push yine gider", async () => {
    const u = await verifiedUser(freshEmail("davetli"));
    const pref = await form(
      "/api/bildirimler",
      { intent: "pref", key: "email.davet", value: "0" },
      u.cookie,
    );
    expect(pref.body).toMatchObject({ prefs: { email: { davet: false } } });
    const before = lastMail(u.email, "dogrulama");
    const res = await form(
      `/api/projeler/${WEB}`,
      { intent: "invite", email: u.email, role: "duzenleyici" },
      jar.suleyman,
    );
    expect(res.status).toBe(200);
    expect(lastMail(u.email)).toEqual(before);
    expect(() => lastMail(u.email, "davet")).toThrow();
    const list = await getJson<{ items: { type: string }[]; unread: number }>(
      "/api/bildirimler",
      u.cookie,
    );
    expect(list.body.items[0]?.type).toBe("davet");
    expect(list.body.unread).toBe(1);
  });

  it("varsayılan olarak davet e-postası gider", async () => {
    const u = await verifiedUser(freshEmail("davetli"));
    await form(
      `/api/projeler/${WEB}`,
      { intent: "invite", email: u.email, role: "duzenleyici" },
      jar.suleyman,
    );
    expect(lastMail(u.email).kind).toBe("davet");
  });
});

describe("bildirim listesi ve okundu", () => {
  async function addFor(userId: string, n: number) {
    const now = Date.now();
    const rows = Array.from({ length: n }, (_, i) => ({
      userId,
      type: "rol_degisti" as const,
      projectId: WEB,
      actorId: ID.suleyman,
      data: { projectName: "Web Sitesi Yenileme", role: "yonetici" },
      createdAt: new Date(now - i * 60_000),
      updatedAt: new Date(now - i * 60_000),
    }));
    // D1'de sorgu başına değişken sınırı: beşer beşer.
    for (let i = 0; i < rows.length; i += 5)
      await db()
        .insert(notifications)
        .values(rows.slice(i, i + 5));
  }

  it("oturumsuz istek giriş sayfasına yönlendirilir", async () => {
    expect((await get("/api/bildirimler")).status).toBe(302);
    expect((await get("/bildirimler")).status).toBe(302);
    expect((await get("/api/push/abonelik")).status).toBe(302);
  });

  it("kişi yalnızca kendi bildirimlerini görür; sayfalar 20'şer, metin tasarımdaki gibidir", async () => {
    await addFor(ID.ayse, 22);
    await addFor(ID.mehmet, 1);
    const first = await getJson<{
      items: { id: string; segments: { text: string }[]; meta: string[]; href: string }[];
      unread: number;
      hasMore: boolean;
      cursor: number;
    }>("/api/bildirimler", jar.ayse);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.unread).toBe(22);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.items[0]!.segments.map((s) => s.text).join("")).toBe(
      "Web Sitesi Yenileme projesindeki rolün yönetici olarak değişti.",
    );
    expect(first.body.items[0]!.meta[0]).toBe("Süleyman Kara");
    expect(first.body.items[0]!.href).toBe(`/proje/${WEB}`);
    const second = await getJson<{ items: unknown[]; hasMore: boolean }>(
      `/api/bildirimler?once=${first.body.cursor}`,
      jar.ayse,
    );
    expect(second.body.items).toHaveLength(2);
    expect(second.body.hasMore).toBe(false);
    expect(
      (await getJson<{ unread: number }>("/api/bildirimler?sayi=1", jar.mehmet)).body.unread,
    ).toBe(1);
  });

  it("tek bildirim ve tümü okundu sayılır; başkasının bildirimi değişmez", async () => {
    await addFor(ID.ayse, 3);
    await addFor(ID.mehmet, 1);
    const [mine] = await notificationsOf(ID.ayse);
    const [theirs] = await notificationsOf(ID.mehmet);
    const one = await form("/api/bildirimler", { intent: "read", id: mine!.id }, jar.ayse);
    expect(one.body).toEqual({ ok: true, changed: 1, unread: 2 });
    const cross = await form("/api/bildirimler", { intent: "read", id: theirs!.id }, jar.ayse);
    expect(cross.body).toEqual({ ok: true, changed: 0, unread: 2 });
    const all = await form("/api/bildirimler", { intent: "read-all" }, jar.ayse);
    expect(all.body).toEqual({ ok: true, changed: 2, unread: 0 });
    const mehmet = await db()
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.userId, ID.mehmet), inArray(notifications.id, [theirs!.id])))
      .get();
    expect(mehmet?.readAt).toBeNull();
    expect((await form("/api/bildirimler", { intent: "yok" }, jar.ayse)).status).toBe(400);
  });

  it("saat dilimi kaydedilir; geçersiz saat dilimi reddedilir", async () => {
    const ok = await form(
      "/api/bildirimler",
      { intent: "time-zone", timeZone: "Asia/Tokyo" },
      jar.can,
    );
    expect(ok.body).toEqual({ ok: true, timeZone: "Asia/Tokyo" });
    const bad = await form(
      "/api/bildirimler",
      { intent: "time-zone", timeZone: "Yok/Yer" },
      jar.can,
    );
    expect(bad.status).toBe(400);
  });

  it("/bildirimler sayfası ve kabuktaki okunmamış sayısı", async () => {
    await addFor(ID.zeynep, 2);
    const res = await get("/bildirimler", { cookie: jar.zeynep });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Bildirimler, 2 yeni");
    expect(html).toContain("projesindeki rolün");
  });
});

describe("dağıtım", () => {
  it("dağıtılmamış bildirimler tam bir kez alınır", async () => {
    await db().insert(notifications).values({ userId: ID.ayse, type: "davet", data: {} });
    const [a, b] = await Promise.all([
      deliverPendingNotifications(env, new Date(), fakePush().impl),
      deliverPendingNotifications(env, new Date(), fakePush().impl),
    ]);
    expect(a.delivered + b.delivered).toBe(1);
  });
});

async function env_fetch_delete(cookie: string, endpoint: string) {
  const { exports } = await import("cloudflare:workers");
  const res = await exports.default.fetch("http://sukano.test/api/push/abonelik", {
    method: "DELETE",
    headers: { cookie, origin: "http://sukano.test", "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  return res.json();
}
