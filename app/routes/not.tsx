import { data, useLocation } from "react-router";
import { NoteDialog } from "~/components/notes/note-dialog";
import { isNoteId } from "~/domain/notes/validation";
import { getCloudflare } from "~/lib/context";
import { NoteNotFoundError, personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/not";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: `${d?.note.title || "Not"} · Sukano` },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  try {
    const note = await personalNotes(getCloudflare(context).env, user.id).get(params.id);
    if (note.trashedAt) throw data(null, { status: 404 });
    return { note };
  } catch (error) {
    if (error instanceof NoteNotFoundError) throw data(null, { status: 404 });
    throw error;
  }
}

/** Açık not: ızgaranın üstünde modal; kapanınca ızgaraya (`/` ya da `/arsiv`) döner. */
export default function NoteRoute({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const closeTo = location.pathname.startsWith("/arsiv") ? "/arsiv" : "/";
  const versions = new URLSearchParams(location.search).has("surumler");
  return (
    <NoteDialog
      key={loaderData.note.id}
      note={loaderData.note}
      closeTo={closeTo}
      initialVersionsOpen={versions}
    />
  );
}
