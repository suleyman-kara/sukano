import { data } from "react-router";
import { isProjectId } from "~/domain/projects/validation";
import { loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.projeler.uyeler";

/**
 * Proje üyeleri (GET) — kişi seçici için: `{ members: ProjectMember[] }`; sıra: sen,
 * sonra rol (yönetici → düzenleyici → görüntüleyici), sonra ad. Her rol atanabilir
 * (görüntüleyici atanabilir ama işaretleyemez). Üye değilse 404.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isProjectId(params.id)) throw data(null, { status: 404 });
  try {
    return {
      members: await projectsService(getCloudflare(context).env, user.id).members(params.id),
    };
  } catch (error) {
    loaderError(error);
  }
}
