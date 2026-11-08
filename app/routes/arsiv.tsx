import { Archive } from "lucide-react";
import { Outlet, useNavigate } from "react-router";
import { NoteGrid } from "~/components/notes/note-grid";
import { EmptyState, NotesPage } from "~/components/notes/notes-page";
import { useNoteActions, usePendingNoteIntents } from "~/components/notes/use-note-actions";
import { PERSONAL_CHANNEL, useLiveGrid } from "~/components/realtime/use-live-channel";
import { applyPendingIntents } from "~/domain/notes/optimistic";
import { getCloudflare } from "~/lib/context";
import { personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/arsiv";
import { revalidateUnlessOffline } from "~/lib/offline-revalidate";

export const meta: Route.MetaFunction = () => [{ title: "Arşiv · Notlarım · Sukano" }];

/** Çevrimdışıyken ekrandaki veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateUnlessOffline;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return { notes: await personalNotes(getCloudflare(context).env, user.id).list("arsiv") };
}

export default function ArchiveRoute({ loaderData }: Route.ComponentProps) {
  const actions = useNoteActions();
  const navigate = useNavigate();
  const live = useLiveGrid(loaderData.notes, "arsiv", PERSONAL_CHANNEL);
  const notes = applyPendingIntents(live.notes, usePendingNoteIntents(), "arsiv");

  return (
    <NotesPage subtitle="Arşiv · yalnızca bu alan" live={live.live}>
      {notes.length === 0 ? (
        <EmptyState icon={<Archive strokeWidth={1.75} aria-hidden="true" />} title="Arşiv boş">
          Arşivlediğin notlar burada durur, aramada görünmeye devam eder.
        </EmptyState>
      ) : (
        <>
          <p className="m-0 text-muted-foreground">
            Arşivlediğin notlar burada durur, aramada görünmeye devam eder. Her alanın (Notlarım ve
            her proje) kendi arşivi vardır.
          </p>
          <NoteGrid
            view="arsiv"
            label="Arşivdeki notlar"
            notes={notes}
            actions={actions}
            hrefFor={(n) => `/arsiv/not/${n.id}`}
            onVersions={(id) => navigate(`/arsiv/not/${id}?surumler`, { preventScrollReset: true })}
          />
        </>
      )}
      <Outlet />
    </NotesPage>
  );
}
