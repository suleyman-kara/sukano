import { data } from "react-router";
import { checkApiLimit } from "~/lib/api-limits.server";
import { assertSameOrigin } from "~/lib/auth-api.server";
import { getCloudflare } from "~/lib/context";
import {
  deleteSubscription,
  hasSubscription,
  parseSubscription,
  saveSubscription,
  vapidKeys,
} from "~/lib/push.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.push.abonelik";

/**
 * Bu cihazın Web Push aboneliği.
 * - GET: `{ publicKey }` (VAPID genel anahtarı; push kapalıysa null);
 *   `?endpoint=` verilirse `subscribed` (bu uç nokta bu hesaba kayıtlı mı).
 * - POST (JSON, `PushSubscription.toJSON()`): kaydeder ya da günceller → `{ ok }`.
 * - DELETE (JSON `{ endpoint }`): bu hesabın aboneliğini siler → `{ ok, removed }`.
 * Hatalar: 400 geçersiz abonelik, 415 JSON değil, 503 push yapılandırılmamış.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const { env } = getCloudflare(context);
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  return {
    publicKey: vapidKeys(env)?.publicKey ?? null,
    ...(endpoint ? { subscribed: await hasSubscription(env, user.id, endpoint) } : {}),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireUser(request, context);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return data({ ok: false as const, error: "JSON bekleniyor" }, { status: 415 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ ok: false as const, error: "Geçersiz istek" }, { status: 400 });
  }
  const { env } = getCloudflare(context);
  if (request.method === "DELETE") {
    const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
    if (typeof endpoint !== "string" || !endpoint)
      return data({ ok: false as const, error: "Geçersiz istek" }, { status: 400 });
    return { ok: true as const, removed: await deleteSubscription(env, user.id, endpoint) };
  }
  if (request.method !== "POST")
    return data({ ok: false as const, error: "Yöntem desteklenmiyor" }, { status: 405 });
  const limited = await checkApiLimit(env, "push", user.id);
  if (limited) return limited;
  if (!vapidKeys(env))
    return data(
      { ok: false as const, error: "Tarayıcı bildirimleri bu sunucuda kapalı" },
      { status: 503 },
    );
  const sub = parseSubscription(body);
  if (!sub) return data({ ok: false as const, error: "Geçersiz abonelik" }, { status: 400 });
  await saveSubscription(env, user.id, { ...sub, userAgent: request.headers.get("user-agent") });
  return { ok: true as const };
}
