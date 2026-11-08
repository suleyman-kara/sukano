import { data } from "react-router";
import { parseNotificationIntent } from "~/domain/reminders/validation";
import { assertSameOrigin } from "~/lib/auth-api.server";
import { getCloudflare } from "~/lib/context";
import {
  listNotifications,
  markAllRead,
  markRead,
  publishNotificationChange,
  setPreference,
  setTimeZone,
  unreadCount,
} from "~/lib/notifications.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.bildirimler";

/**
 * Oturumdaki kişinin bildirimleri.
 * - GET: `NotificationPage` (`{ items, unread, hasMore, cursor }`, en yeni önce, 20'şer);
 *   `?once=<ms>` daha eskiler; `?sayi=1` yalnızca `{ unread }`.
 * - POST (form, `intent`): `read` (`id` ya da virgüllü `ids`), `read-all`,
 *   `pref` (`key`: `push.hatirlatici` | `push.goreveAtandi` | `push.davet` | `email.davet`,
 *   `value`: `1` | `0`), `time-zone` (`timeZone`: IANA). Yanıt `{ ok, unread? , prefs? }`.
 *   Başkasının bildirimine dokunulmaz (okundu sayısı 0 döner).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const { env } = getCloudflare(context);
  const url = new URL(request.url);
  if (url.searchParams.has("sayi")) return { unread: await unreadCount(env, user.id) };
  const before = Number(url.searchParams.get("once"));
  return listNotifications(env, user.id, {
    before: Number.isFinite(before) && before > 0 ? before : undefined,
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireUser(request, context);
  if (request.method !== "POST")
    return data({ ok: false as const, error: "Yöntem desteklenmiyor" }, { status: 405 });
  const parsed = parseNotificationIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  const { env, ctx } = getCloudflare(context);
  const intent = parsed.value;
  switch (intent.intent) {
    case "read":
    case "read-all": {
      const changed =
        intent.intent === "read"
          ? await markRead(env, user.id, intent.ids)
          : await markAllRead(env, user.id);
      // Diğer sekme ve cihazlardaki zil de yeniden saysın.
      if (changed > 0) ctx.waitUntil(publishNotificationChange(env, [user.id]));
      return { ok: true as const, changed, unread: await unreadCount(env, user.id) };
    }
    case "pref": {
      const prefs = await setPreference(env, user.id, intent.key, intent.value);
      return { ok: true as const, prefs };
    }
    case "time-zone":
      return { ok: true as const, timeZone: await setTimeZone(env, user.id, intent.timeZone) };
  }
}
