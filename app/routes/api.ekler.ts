import { data } from "react-router";
import { canInline, contentDisposition } from "~/domain/attachments/rules";
import { isNoteId } from "~/domain/notes/validation";
import { apiError, fail, loaderError } from "~/lib/api-errors.server";
import { attachmentChangeEffects, attachmentsService, sameOrigin } from "~/lib/attachments.server";
import { getCloudflare } from "~/lib/context";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.ekler";

/**
 * Tek ek.
 * - GET: dosya R2'den Worker üzerinden akar (kova herkese açık değil). Görseller ve PDF
 *   `inline`, diğerleri ve `?indir=1` ile her şey `attachment`. `nosniff`, özel önbellek
 *   (1 saat), ETag ile 304. Not sahibi / proje üyesi değilse 404.
 * - DELETE: eki kaldırır (R2 nesnesi de silinir) → `{ ok: true }`; görüntüleyici 403.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  const download = new URL(request.url).searchParams.has("indir");
  try {
    const svc = attachmentsService(getCloudflare(context).env, user.id);
    const { att, object } = await svc.open(params.id, { onlyIf: request.headers });
    const inline = !download && canInline(att.contentType);
    const headers = new Headers({
      "Content-Type": att.contentType,
      "Content-Disposition": contentDisposition(att.name, inline ? "inline" : "attachment"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      ETag: object.httpEtag,
    });
    // Tarayıcıda açılan görsel sayfa olarak hiçbir şey çalıştırmasın. (PDF görüntüleyicisi
    // ve indirmeler sandbox'la bozulur: Chrome sandbox'lı yanıtta dosya adını yok sayar.)
    if (inline && att.contentType !== "application/pdf") {
      headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
    }
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    loaderError(error);
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  if (request.method !== "DELETE") return fail("Yöntem desteklenmiyor", 405);
  if (!sameOrigin(request)) return fail("İzin verilmeyen köken", 403);
  if (!isNoteId(params.id)) return fail("Not bulunamadı", 404);
  const { env, ctx } = getCloudflare(context);
  try {
    const { note } = await attachmentsService(env, user.id).remove(params.id);
    ctx.waitUntil(attachmentChangeEffects(env, user.id, note));
    return { ok: true as const };
  } catch (error) {
    return apiError(error);
  }
}
