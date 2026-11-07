import { data } from "react-router";
import { isNoteId } from "~/domain/notes/validation";
import { loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { noteAccess } from "~/lib/note-access.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.notlar.surumler";

/**
 * Sürüm geçmişi (GET). `?surum=<id>` verilirse o sürümün önizlemesi de döner.
 * Kişisel notta sahibi, proje notunda her üye (görüntüleyici dahil) görebilir.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const versionId = new URL(request.url).searchParams.get("surum");
  if (!isNoteId(params.id) || (versionId !== null && !isNoteId(versionId))) {
    throw data(null, { status: 404 });
  }
  try {
    const { notes: svc } = await noteAccess(getCloudflare(context).env, user.id).forNote(params.id);
    const versions = await svc.listVersions(params.id);
    const preview = versionId ? await svc.getVersion(params.id, versionId) : null;
    return { versions, preview };
  } catch (error) {
    loaderError(error);
  }
}
