/**
 * Web Push abonelikleri ve gönderim. Abonelik cihaz (tarayıcı) başınadır; aynı uç nokta
 * başka hesapla yeniden kaydedilirse o hesaba geçer. Push hizmeti 404 / 410 dönerse
 * abonelik silinir. VAPID anahtarları yoksa (yerel geliştirme, testler) push sessizce
 * atlanır; uygulama içi bildirim yine yazılır.
 */
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "~/db/client";
import { pushSubscriptions } from "~/db/schema";
import {
  buildPushRequest,
  type PushRequestOptions,
  type PushTarget,
  type VapidKeys,
} from "~/domain/notifications/web-push";

type PushEnv = {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

export const DEFAULT_VAPID_SUBJECT = "mailto:bildirim@sukano.app";

/** VAPID anahtarları tanımlıysa onlar; değilse null (push kapalı). */
export function vapidKeys(env: PushEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT,
  };
}

export type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Tarayıcının `PushSubscription.toJSON()` çıktısını doğrular. */
export function parseSubscription(raw: unknown): SubscriptionInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const keys = (typeof r.keys === "object" && r.keys !== null ? r.keys : {}) as Record<
    string,
    unknown
  >;
  const endpoint = r.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const { p256dh, auth } = keys;
  if (
    typeof p256dh !== "string" ||
    !B64URL.test(p256dh) ||
    p256dh.length < 80 ||
    p256dh.length > 100
  )
    return null;
  if (typeof auth !== "string" || !B64URL.test(auth) || auth.length < 16 || auth.length > 32)
    return null;
  return { endpoint, p256dh, auth };
}

export async function saveSubscription(env: PushEnv, userId: string, sub: SubscriptionInput) {
  const db = createDb(env.DB);
  const now = new Date();
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      userAgent: sub.userAgent?.slice(0, 300) ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent?.slice(0, 300) ?? null,
        updatedAt: now,
      },
    });
}

/** Kişinin aboneliğini (uç noktayla) siler; başkasınınkine dokunmaz. */
export async function deleteSubscription(env: PushEnv, userId: string, endpoint: string) {
  const res = await createDb(env.DB)
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return res.length > 0;
}

export async function hasSubscription(env: PushEnv, userId: string, endpoint: string) {
  const row = await createDb(env.DB)
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .get();
  return Boolean(row);
}

export type PushResult = { sent: number; removed: number; failed: number };

/**
 * Kişilerin tüm cihazlarına aynı yükü gönderir. 404 / 410 → abonelik silinir; diğer
 * hatalar günlüğe yazılır (bildirim uygulama içinde zaten var).
 */
export async function sendPushToUsers(
  env: PushEnv,
  messages: { userId: string; payload: unknown; options?: PushRequestOptions }[],
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  const keys = vapidKeys(env);
  if (!keys || messages.length === 0) return result;
  const db = createDb(env.DB);
  const userIds = [...new Set(messages.map((m) => m.userId))];
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return result;
  const gone: string[] = [];
  const used: string[] = [];
  await Promise.all(
    messages.flatMap((m) =>
      subs
        .filter((s) => s.userId === m.userId)
        .map(async (s) => {
          const target: PushTarget = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth };
          try {
            const { url, init } = await buildPushRequest(target, m.payload, keys, m.options);
            const res = await fetchImpl(url, init);
            if (res.status === 404 || res.status === 410) {
              gone.push(s.id);
              result.removed++;
            } else if (res.ok) {
              used.push(s.id);
              result.sent++;
            } else {
              result.failed++;
              console.error(`[push] ${new URL(s.endpoint).host} ${res.status}`);
            }
          } catch (error) {
            result.failed++;
            console.error("[push] gönderilemedi:", error);
          }
        }),
    ),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (used.length)
    await db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(inArray(pushSubscriptions.id, used));
  return result;
}
