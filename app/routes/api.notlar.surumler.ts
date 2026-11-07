import { data } from "react-router";
import { isNoteId } from "~/domain/notes/validation";
import { getCloudflare } from "~/lib/context";
import { NoteNotFoundError, personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.notlar.surumler";

/**
 * Sürüm geçmişi (GET). `?surum=<id>` verilirse o sürümün önizlemesi de döner.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const versionId = new URL(request.url).searchParams.get("surum");
  if (!isNoteId(params.id) || (versionId !== null && !isNoteId(versionId))) {
    throw data(null, { status: 404 });
  }
  const svc = personalNotes(getCloudflare(context).env, user.id);
  try {
    const versions = await svc.listVersions(params.id);
    const preview = versionId ? await svc.getVersion(params.id, versionId) : null;
    return { versions, preview };
  } catch (error) {
    if (error instanceof NoteNotFoundError) throw data(null, { status: 404 });
    throw error;
  }
}
