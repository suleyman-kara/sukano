import { data } from "react-router";
import { parseNoteIntent } from "~/domain/notes/validation";
import { apiError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { noteAccess } from "~/lib/note-access.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.notlar";

/**
 * Not eylemleri (POST, form verisi; `intent` alanı işlemi seçer). Arayüz bunları
 * `useNoteActions()` ile fetcher üzerinden gönderir; tamamlanınca loader'lar
 * yeniden doğrulanır.
 *
 * Alan notun kendisinden çözülür (kişisel ya da üyesi olunan proje); `create`,
 * `create-todo` ve `empty-trash` isteğe bağlı `projectId` alır. Proje notunda her
 * eylem rol denetiminden geçer (görüntüleyici → 403). Hatalar: 400 geçersiz form,
 * 403 yetki yok, 404 not/proje yok, 409 durum uygun değil.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  const parsed = parseNoteIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  try {
    const result = await noteAccess(getCloudflare(context).env, user.id).run(parsed.value);
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    return apiError(error);
  }
}

export function loader() {
  throw data(null, { status: 405 });
}
