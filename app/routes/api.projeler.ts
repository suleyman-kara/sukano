import { data } from "react-router";
import { parseProjectsIntent } from "~/domain/projects/validation";
import { apiError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.projeler";

/**
 * Projeler koleksiyonu.
 * - GET: sol menü `{ projects: SidebarProject[], deletedCount }` ve silinmiş projeler
 *   (`?silinmis=1` → `{ deleted: DeletedProject[] }`, yalnızca yönetici olunanlar).
 * - POST (form, `intent`): `create` (`name`, `color?`, `description?`, `emoji?`, `id?`)
 *   → `{ ok, id }`; `reorder` (`order`: JSON kimlik dizisi) → `{ ok }`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const svc = projectsService(getCloudflare(context).env, user.id);
  if (new URL(request.url).searchParams.has("silinmis")) return { deleted: await svc.deleted() };
  return await svc.sidebar();
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  const parsed = parseProjectsIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  try {
    const result = await projectsService(getCloudflare(context).env, user.id).runCollection(
      parsed.value,
    );
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    return apiError(error);
  }
}
