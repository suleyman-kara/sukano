import { data } from "react-router";
import { parseInviteIntent } from "~/domain/projects/validation";
import { apiError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { invitationsService } from "~/lib/invitations.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.davetler";

/**
 * Gelen davetler.
 * - GET: `InvitesPageData` → `{ pending: IncomingInvite[], history: IncomingInvite[] }`.
 * - POST (form): `intent=accept|decline`, `id` → kabulde `{ ok, projectId }`.
 *   Hatalar: 404 davet yok (başkasının daveti dahil), 409 süresi doldu / geçersiz
 *   (`code`: `suresi_doldu`, `gecersiz_davet`).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return await invitationsService(getCloudflare(context).env, user.id).list();
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  const parsed = parseInviteIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  try {
    const result = await invitationsService(getCloudflare(context).env, user.id).run(parsed.value);
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    return apiError(error);
  }
}
