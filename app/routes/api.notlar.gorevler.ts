import { data } from "react-router";
import { isNoteId } from "~/domain/notes/validation";
import { parseTaskOps } from "~/domain/tasks/ops";
import { getCloudflare } from "~/lib/context";
import { NoteNotFoundError } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import { NoteConflictError, personalTasks, TaskOpError } from "~/lib/tasks.server";
import type { Route } from "./+types/api.notlar.gorevler";

/**
 * Yapılacaklar notunun görevleri.
 * - GET: `{ tasks }` (düz liste, ağaç sırasında).
 * - POST (JSON `{ ops: TaskOp[] }`, bkz. `app/domain/tasks/ops.ts`): işlemler tek batch'te
 *   uygulanır; yanıt `{ ok: true, tasks }`. Hatalar: 400 geçersiz gövde, 404 not yok,
 *   409 işlem uygulanamadı (olmayan görev, döngü, alt görevli silme, not çöpte …).
 *   Hata durumunda hiçbir işlem uygulanmaz.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  try {
    return { tasks: await personalTasks(getCloudflare(context).env, user.id).list(params.id) };
  } catch (error) {
    if (error instanceof NoteNotFoundError) throw data(null, { status: 404 });
    throw error;
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
    const tasks = await personalTasks(getCloudflare(context).env, user.id).applyOps(
      params.id,
      parsed.value,
    );
    return { ok: true as const, tasks };
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return data({ ok: false as const, error: "Not bulunamadı" }, { status: 404 });
    }
    if (error instanceof TaskOpError || error instanceof NoteConflictError) {
      return data({ ok: false as const, error: error.message }, { status: 409 });
    }
    throw error;
  }
}
