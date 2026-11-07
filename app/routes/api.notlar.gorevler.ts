import { data } from "react-router";
import { isNoteId } from "~/domain/notes/validation";
import { parseTaskOps } from "~/domain/tasks/ops";
import { apiError, loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { noteAccess } from "~/lib/note-access.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.notlar.gorevler";

/**
 * Yapılacaklar notunun görevleri (kişisel ya da proje notu).
 * - GET: `{ tasks, assignees }` (düz liste, ağaç sırasında; `assignees` görev kimliği →
 *   kullanıcı kimlikleri, yalnızca proje notunda dolu).
 * - POST (JSON `{ ops: TaskOp[] }`, bkz. `app/domain/tasks/ops.ts`): işlemler tek batch'te
 *   uygulanır; yanıt `{ ok: true, tasks, assignees }`. Hatalar: 400 geçersiz gövde,
 *   403 yetki yok (görüntüleyici görev işaretleyemez, düzenleyemez), 404 not yok,
 *   409 işlem uygulanamadı (olmayan görev, döngü, üye olmayan atama, not çöpte …).
 *   Hata durumunda hiçbir işlem uygulanmaz.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  try {
    const { tasks } = await noteAccess(getCloudflare(context).env, user.id).forNote(params.id);
    return await tasks.state(params.id);
  } catch (error) {
    loaderError(error);
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  if (request.method !== "POST")
    return data({ ok: false as const, error: "Yöntem desteklenmiyor" }, { status: 405 });
  if (!isNoteId(params.id))
    return data({ ok: false as const, error: "Not bulunamadı" }, { status: 404 });
  // Yalnızca JSON: başka sitelerden gelen basit form gönderimleri (CSRF) reddedilir.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return data({ ok: false as const, error: "JSON bekleniyor" }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ ok: false as const, error: "Geçersiz istek" }, { status: 400 });
  }
  const parsed = parseTaskOps(body);
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  try {
    const { tasks } = await noteAccess(getCloudflare(context).env, user.id).forNote(params.id);
    const state = await tasks.apply(params.id, parsed.value);
    return { ok: true as const, ...state };
  } catch (error) {
    return apiError(error);
  }
}
