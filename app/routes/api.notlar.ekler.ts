import { data } from "react-router";
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from "~/domain/attachments/rules";
import { isNoteId } from "~/domain/notes/validation";
import { apiError, fail, loaderError } from "~/lib/api-errors.server";
import {
  attachmentChangeEffects,
  attachmentsService,
  AttachmentRejectedError,
  sameOrigin,
} from "~/lib/attachments.server";
import { getCloudflare } from "~/lib/context";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.notlar.ekler";

/** Çok parçalı gövdenin dosya dışı payı (sınır, başlıklar). */
const MULTIPART_SLACK = 64 * 1024;

/**
 * Notun ekleri (yalnızca metin notu).
 * - GET: `{ attachments: AttachmentInfo[] }` (eklenme sırasıyla); her üye görür.
 * - POST (multipart, alan `dosya`): ek yükler → 201 `{ ok, attachment }`. Hatalar:
 *   400 dosya yok / boş, 403 yetki yok ya da başka köken, 404 not yok, 409 yapılacaklar
 *   notu / çöpte / not başına sınır, 413 10 MB'yi aşıyor, 415 izin verilmeyen tür.
 *
 * Başarıdan sonra kanala `icerik` (kart kapağı) ve not odasına `not.attachments`.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  try {
    const svc = attachmentsService(getCloudflare(context).env, user.id);
    return { attachments: await svc.list(params.id) };
  } catch (error) {
    loaderError(error);
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  if (request.method !== "POST") return fail("Yöntem desteklenmiyor", 405);
  if (!sameOrigin(request)) return fail("İzin verilmeyen köken", 403);
  if (!isNoteId(params.id)) return fail("Not bulunamadı", 404);
  // Gövdeyi okumadan önce: açıkça büyük istek hemen reddedilir.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_ATTACHMENT_BYTES + MULTIPART_SLACK) {
    return fail(tooLargeMessage(length), 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return fail("Dosya bekleniyor", 415);
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("dosya");
  } catch {
    return fail("Geçersiz istek", 400);
  }
  if (!(file instanceof File)) return fail("Dosya seçilmedi", 400);
  const { env, ctx } = getCloudflare(context);
  try {
    const { attachment, note } = await attachmentsService(env, user.id).upload(params.id, file);
    ctx.waitUntil(attachmentChangeEffects(env, user.id, note));
    return data({ ok: true as const, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof AttachmentRejectedError) return fail(error.message, error.status);
    return apiError(error);
  }
}
