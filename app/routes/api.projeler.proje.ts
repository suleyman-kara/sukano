import { data } from "react-router";
import { isProjectId, parseProjectIntent } from "~/domain/projects/validation";
import { apiError, loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { applyProjectIntentEffects } from "~/lib/realtime.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.projeler.proje";

/**
 * Tek proje.
 * - GET: proje sayfası verisi `ProjectPageData` (`?gorunum=notlar|arsiv|cop`), ya da
 *   `?ayarlar=1` → `ProjectSettingsData`. Üye değilse 404.
 * - POST (form, `intent`): `update`, `delete`, `restore`, `leave`, `invite`
 *   (`email`, `role`) → `{ ok, invitationId }`, `revoke-invite` (`invitationId`),
 *   `set-role` (`userId`, `role`), `remove-member` (`userId`).
 *   Hatalar: 400 geçersiz form, 403 rol yetmiyor, 404 proje yok / üye değil,
 *   409 kural (`code`: `son_yonetici`, `hesap_yok`, `dogrulanmamis`, `zaten_uye`,
 *   `bekleyen_davet`, `kendini_cikaramaz`, `uye_yok`, `gecersiz_davet` …).
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isProjectId(params.id)) throw data(null, { status: 404 });
  const url = new URL(request.url);
  const svc = projectsService(getCloudflare(context).env, user.id);
  try {
    if (url.searchParams.has("ayarlar")) return await svc.settings(params.id);
    const view = url.searchParams.get("gorunum");
    return await svc.page(params.id, view === "arsiv" || view === "cop" ? view : "notlar");
  } catch (error) {
    loaderError(error);
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  if (!isProjectId(params.id))
    return data({ ok: false as const, error: "Proje bulunamadı" }, { status: 404 });
  const parsed = parseProjectIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  const { env, ctx } = getCloudflare(context);
  try {
    const result = await projectsService(env, user.id).run(params.id, parsed.value);
    // Proje kanalına olay (proje, üyelik, silindi); yanıt beklemez.
    ctx.waitUntil(applyProjectIntentEffects(env, user.id, params.id, parsed.value));
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    return apiError(error);
  }
}
