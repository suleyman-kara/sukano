/**
 * Uygulama içi bildirimler (zil + liste), tercihler ve dağıtım.
 *
 * Bildirim satırlarını yazan yerler (davet, rol, çıkarma, proje silme, göreve atanma,
 * hatırlatıcı) yalnızca satırı ekler; `delivered_at` boş kalır. `deliverPendingNotifications`
 * boş olanları tek bir koşullu UPDATE … RETURNING ile **tam bir kez** alır, sahiplerinin
 * kişisel kanalına (`kisi:<userId>`) `bildirim` olayı yayınlar ve tercihe göre Web Push
 * gönderir. İstek sonrası (`ctx.waitUntil`) ve her dakika cron'da çağrılır; ikisi aynı satırı
 * iki kez alamaz.
 */
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { createDb, type Database } from "~/db/client";
import { notifications, projects, user, userPreferences } from "~/db/schema";
import {
  pushPayloadFor,
  renderNotification,
  type NotificationRow,
  type NotificationView,
} from "~/domain/notifications/copy";
import {
  normalizePrefs,
  pushEnabledFor,
  updatePrefs,
  type Prefs,
} from "~/domain/notifications/prefs";
import { resolveTimeZone } from "~/domain/reminders/time";
import { sendPushToUsers } from "./push.server";
import { publishChannel } from "./realtime.server";

type DbEnv = { DB: D1Database };
type DeliverEnv = DbEnv &
  Pick<Env, "PROJECT_ROOM" | "NOTE_ROOM"> & {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  };

export const PAGE_SIZE = 20;
/** Bir dağıtım turunda en çok alınan satır. */
export const DELIVERY_BATCH = 100;

export type NotificationPage = {
  items: NotificationView[];
  unread: number;
  /** Daha eski bildirim var mı ("Daha eski bildirimler"). */
  hasMore: boolean;
  /** Sonraki sayfa için: son öğenin `createdAt`'i (ms). */
  cursor: number | null;
};

/* ------------------------------------------------------------------ */
/* Tercihler ve saat dilimi                                            */
/* ------------------------------------------------------------------ */

export async function userSettings(
  env: DbEnv,
  userId: string,
): Promise<{ prefs: Prefs; timeZone: string }> {
  const row = await createDb(env.DB)
    .select({ prefs: userPreferences.notificationPrefs, timeZone: userPreferences.timeZone })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  return { prefs: normalizePrefs(row?.prefs), timeZone: resolveTimeZone(row?.timeZone) };
}

/** Birden çok kişinin tercihleri ve saat dilimi (yoksa varsayılan). */
export function settingsOf(env: DbEnv, userIds: readonly string[]) {
  return settingsFromDb(createDb(env.DB), userIds);
}

export async function settingsFromDb(db: Database, userIds: readonly string[]) {
  const out = new Map<string, { prefs: Prefs; timeZone: string }>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({
      userId: userPreferences.userId,
      prefs: userPreferences.notificationPrefs,
      timeZone: userPreferences.timeZone,
    })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, [...new Set(userIds)]));
  for (const r of rows)
    out.set(r.userId, { prefs: normalizePrefs(r.prefs), timeZone: resolveTimeZone(r.timeZone) });
  for (const id of userIds)
    if (!out.has(id)) out.set(id, { prefs: normalizePrefs(null), timeZone: resolveTimeZone(null) });
  return out;
}

/** Tek tercihi değiştirir; bilinmeyen anahtarda null. */
export async function setPreference(
  env: DbEnv,
  userId: string,
  key: string,
  value: boolean,
): Promise<Prefs | null> {
  const { prefs } = await userSettings(env, userId);
  const next = updatePrefs(prefs, key, value);
  if (!next) return null;
  const now = new Date();
  await createDb(env.DB)
    .insert(userPreferences)
    .values({ userId, notificationPrefs: next, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { notificationPrefs: next, updatedAt: now },
    });
  return next;
}

/** Tarayıcıdan gelen saat dilimini saklar (geçersizse varsayılan). */
export async function setTimeZone(env: DbEnv, userId: string, timeZone: string) {
  const tz = resolveTimeZone(timeZone);
  const now = new Date();
  await createDb(env.DB)
    .insert(userPreferences)
    .values({ userId, timeZone: tz, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { timeZone: tz, updatedAt: now },
    });
  return tz;
}

/* ------------------------------------------------------------------ */
/* Liste ve okundu                                                     */
/* ------------------------------------------------------------------ */

const rowSelect = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  data: notifications.data,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
  projectId: notifications.projectId,
  noteId: notifications.noteId,
  actorName: user.name,
  projectName: projects.name,
};

type JoinedRow = {
  id: string;
  userId: string;
  type: NotificationRow["type"];
  data: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
  projectId: string | null;
  noteId: string | null;
  actorName: string | null;
  projectName: string | null;
};

const toRow = (r: JoinedRow): NotificationRow => ({
  id: r.id,
  type: r.type,
  data: r.data ?? {},
  createdAt: r.createdAt.getTime(),
  readAt: r.readAt ? r.readAt.getTime() : null,
  projectId: r.projectId,
  noteId: r.noteId,
  actorName: r.actorName,
  projectName: r.projectName,
});

export async function unreadCount(env: DbEnv, userId: string): Promise<number> {
  const row = await createDb(env.DB)
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();
  return Number(row?.n ?? 0);
}

/** En yeni önce; `before` (ms) verilirse ondan eski olanlar. */
export async function listNotifications(
  env: DbEnv,
  userId: string,
  {
    before,
    limit = PAGE_SIZE,
    now = Date.now(),
  }: { before?: number; limit?: number; now?: number } = {},
): Promise<NotificationPage> {
  const db = createDb(env.DB);
  const { timeZone } = await userSettings(env, userId);
  const rows = (await db
    .select(rowSelect)
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(
      and(
        eq(notifications.userId, userId),
        before ? lt(notifications.createdAt, new Date(before)) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)) as JoinedRow[];
  const page = rows.slice(0, limit);
  return {
    items: page.map((r) => renderNotification(toRow(r), { now, timeZone })),
    unread: await unreadCount(env, userId),
    hasMore: rows.length > limit,
    cursor: page.at(-1)?.createdAt.getTime() ?? null,
  };
}

/** Kişinin bildirimlerini okundu sayar (başkasınınkine dokunmaz). Değişen sayı. */
export async function markRead(
  env: DbEnv,
  userId: string,
  ids: readonly string[],
  now = new Date(),
) {
  if (ids.length === 0) return 0;
  const res = await createDb(env.DB)
    .update(notifications)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, [...ids]),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return res.length;
}

export async function markAllRead(env: DbEnv, userId: string, now = new Date()) {
  const res = await createDb(env.DB)
    .update(notifications)
    .set({ readAt: now, updatedAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return res.length;
}

/** Kişinin açık sekmelerindeki zile "yeniden say" der. */
export async function publishNotificationChange(
  env: Pick<Env, "PROJECT_ROOM" | "NOTE_ROOM">,
  userIds: readonly string[],
) {
  await Promise.all(
    [...new Set(userIds)].map((userId) =>
      publishChannel(env, { kind: "personal", userId }, [{ type: "bildirim" }], userId),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Dağıtım                                                             */
/* ------------------------------------------------------------------ */

export type DeliveryResult = { delivered: number; pushed: number; removed: number };

/**
 * Dağıtılmamış bildirimleri tam bir kez alır: kanala canlı olay + tercihe göre push.
 * `PROJECT_ROOM` yoksa (yalın D1 testleri) yayın atlanır.
 */
export async function deliverPendingNotifications(
  env: DeliverEnv,
  now = new Date(),
  fetchImpl?: typeof fetch,
): Promise<DeliveryResult> {
  const db = createDb(env.DB);
  const claimed = await db
    .update(notifications)
    .set({ deliveredAt: now })
    .where(
      and(
        isNull(notifications.deliveredAt),
        inArray(
          notifications.id,
          db
            .select({ id: notifications.id })
            .from(notifications)
            .where(isNull(notifications.deliveredAt))
            .orderBy(notifications.createdAt)
            .limit(DELIVERY_BATCH),
        ),
      ),
    )
    .returning({ id: notifications.id });
  if (claimed.length === 0) return { delivered: 0, pushed: 0, removed: 0 };

  const rows = (await db
    .select(rowSelect)
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(
      inArray(
        notifications.id,
        claimed.map((c) => c.id),
      ),
    )) as JoinedRow[];

  const settings = await settingsOf(
    env,
    rows.map((r) => r.userId),
  );
  const messages = rows.flatMap((r) => {
    const s = settings.get(r.userId)!;
    if (!pushEnabledFor(s.prefs, r.type)) return [];
    const payload = pushPayloadFor(toRow(r), { now: now.getTime(), timeZone: s.timeZone });
    if (!payload) return [];
    return [
      {
        userId: r.userId,
        payload,
        options: {
          urgency: r.type === "hatirlatici" ? ("high" as const) : ("normal" as const),
          ttl: r.type === "hatirlatici" ? 6 * 60 * 60 : 24 * 60 * 60,
        },
      },
    ];
  });

  const [push] = await Promise.all([
    sendPushToUsers(env, messages, fetchImpl),
    env.PROJECT_ROOM
      ? publishNotificationChange(
          env,
          rows.map((r) => r.userId),
        )
      : Promise.resolve(),
  ]);
  return { delivered: rows.length, pushed: push.sent, removed: push.removed };
}
