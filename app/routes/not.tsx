import { data, useLocation } from "react-router";
import type { NoteAccessInfo, MoveTarget } from "~/components/notes/note-access";
import { NoteDialog } from "~/components/notes/note-dialog";
import { closeHref } from "~/components/notes/note-links";
import { isNoteId } from "~/domain/notes/validation";
import { getCloudflare } from "~/lib/context";
import { noteAccess } from "~/lib/note-access.server";
import { userSettings } from "~/lib/notifications.server";
import { noteReminders } from "~/lib/reminders.server";
import { NoteNotFoundError } from "~/lib/notes.server";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/not";
import { revalidateNote } from "~/lib/offline-revalidate";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: `${d?.note.title || "Not"} · Sukano` },
];

/** Yalnızca kendi verisi değişince yüklenir; çevrimdışıyken veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateNote;

/**
 * Açık not: kişisel not ya da üyesi olunan projenin notu (`noteAccess.forNote`).
 * Proje notunda rol (görüntüleyici salt okur), üyeler (kişi seçici) ve "Taşı veya
 * kopyala…" / "Kopyala…" hedefleri (üyesi olunan projeler, rolüyle) birlikte gelir.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isNoteId(params.id)) throw data(null, { status: 404 });
  const env = getCloudflare(context).env;
  try {
    const projects = projectsService(env, user.id);
    // Birbirinden bağımsız okumalar paralel (her D1 turu birincil veritabanına bir yolculuk):
    // erişim, hedef projeler, hatırlatıcılar ve saat dilimi aynı anda; sonra not ve üyeler.
    // Hatırlatıcılar erişim denetiminden önce okunur ama erişim yoksa hiçbir şey dönmez.
    const [{ scope, notes }, sidebar, reminders, { timeZone }] = await Promise.all([
      noteAccess(env, user.id).forNote(params.id),
      projects.sidebar({ counts: false }),
      noteReminders(env, params.id),
      userSettings(env, user.id),
    ]);
    const [note, members] = await Promise.all([
      notes.get(params.id),
      scope.kind === "project" ? projects.members(scope.projectId, { verified: true }) : null,
    ]);
    if (note.trashedAt) throw data(null, { status: 404 });
    const targets: MoveTarget[] = sidebar.projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      role: p.role,
    }));
    let access: NoteAccessInfo = { kind: "personal" };
    if (scope.kind === "project" && members) {
      const project = targets.find((t) => t.id === scope.projectId);
      access = {
        kind: "project",
        role: scope.role,
        project: {
          id: scope.projectId,
          name: project?.name ?? "Proje",
          color: project?.color ?? "grimavi",
        },
        members: members.map((m) => ({
          id: m.userId,
          name: m.name,
          color: m.avatarColor,
          avatarUrl: m.avatarUrl,
          isMe: m.isMe,
          viewer: m.role === "goruntuleyici",
        })),
      };
    }
    return { note, access, targets, reminders, timeZone };
  } catch (error) {
    if (error instanceof NoteNotFoundError) throw data(null, { status: 404 });
    throw error;
  }
}

/**
 * Izgaranın (Notlarım, arşiv, proje sayfası) ya da arama sonuçlarının üstünde modal;
 * kapanınca yoldaki `/not/:id` atılır (`/`, `/arsiv`, `/proje/:id`, `/ara?q=…`).
 */
export default function NoteRoute({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const closeTo = closeHref(location.pathname, location.search);
  const params = new URLSearchParams(location.search);
  const versions = params.has("surumler");
  return (
    <NoteDialog
      key={loaderData.note.id}
      note={loaderData.note}
      access={loaderData.access}
      targets={loaderData.targets}
      closeTo={closeTo}
      initialVersionsOpen={versions}
      initialMoveOpen={params.has("tasi")}
      reminders={loaderData.reminders}
      timeZone={loaderData.timeZone}
      initialReminderOpen={params.has("hatirlatici")}
    />
  );
}
