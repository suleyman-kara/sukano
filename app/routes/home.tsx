import { FileText } from "lucide-react";
import { useState } from "react";
import { Outlet, useNavigate } from "react-router";
import type { ComposerDraft, ComposerMode } from "~/components/notes/composer";
import { LazyComposer as Composer } from "~/components/notes/lazy-composer";
import { MobileNewNote } from "~/components/notes/mobile-new-note";
import { NoteGrid } from "~/components/notes/note-grid";
import { PendingNotePreview } from "~/components/notes/note-preview";
import { EmptyState, NotesPage, SectionHeading } from "~/components/notes/notes-page";
import { useNoteActions, usePendingNoteIntents } from "~/components/notes/use-note-actions";
import { Button } from "~/components/ui/button";
import { OfflineInert } from "~/components/realtime/live-status";
import { PERSONAL_CHANNEL, useLiveGrid } from "~/components/realtime/use-live-channel";
import { applyPendingIntents } from "~/domain/notes/optimistic";
import { splitPinned } from "~/domain/notes/ordering";
import { getCloudflare } from "~/lib/context";
import { personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/home";
import { revalidateGrid } from "~/lib/offline-revalidate";

export const meta: Route.MetaFunction = () => [
  { title: "Notlarım · Sukano" },
  { name: "description", content: "Kişisel notların ve ekip projelerin, tek yerde." },
];

/** Yalnızca kendi verisi değişince yüklenir; çevrimdışıyken veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateGrid;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return { notes: await personalNotes(getCloudflare(context).env, user.id).list("notlar") };
}

/** Notlarım: not al alanı, sabitlenmiş ve diğer notlar; açık not alt rotada (/not/:id). */
export default function Home({ loaderData }: Route.ComponentProps) {
  const actions = useNoteActions();
  const navigate = useNavigate();
  const pending = usePendingNoteIntents();
  const [mobileComposer, setMobileComposer] = useState<ComposerMode | false>(false);
  // Canlı ızgara: diğer sekme ve cihazlardaki değişiklikler kişisel kanaldan gelir.
  const live = useLiveGrid(loaderData.notes, "notlar", PERSONAL_CHANNEL);
  const notes = applyPendingIntents(live.notes, pending, "notlar");
  const { pinned, others } = splitPinned(notes);

  const save = ({ kind, tasks, ...draft }: ComposerDraft) =>
    kind === "todo"
      ? actions.createTodo({
          title: draft.title,
          color: draft.color,
          pinned: draft.pinned,
          tasks,
        })
      : actions.create(draft);
  const grid = {
    view: "notlar" as const,
    actions,
    hrefFor: (n: { id: string }) => `/not/${n.id}`,
    onVersions: (id: string) => navigate(`/not/${id}?surumler`, { preventScrollReset: true }),
    onMoveCopy: (id: string) => navigate(`/not/${id}?tasi`, { preventScrollReset: true }),
  };
  const openComposer = () => {
    if (window.matchMedia("(min-width: 768px)").matches) document.getElementById("not-al")?.click();
    else setMobileComposer("text");
  };

  return (
    <NotesPage live={live.live}>
      <OfflineInert live={live.live}>
        <Composer onSave={save} className="max-md:hidden" />
      </OfflineInert>

      {notes.length === 0 ? (
        <EmptyState
          icon={<FileText strokeWidth={1.75} aria-hidden="true" />}
          title="Henüz not yok"
          actions={<Button onClick={openComposer}>Not al</Button>}
        >
          Yukarıdaki &ldquo;Not al&rdquo; alanına yaz ya da bir yapılacaklar notu başlat. Notların
          yalnızca sana görünür.
        </EmptyState>
      ) : (
        <>
          {pinned.length > 0 && (
            <div>
              <SectionHeading>Sabitlenmiş</SectionHeading>
              <NoteGrid
                {...grid}
                label="Sabitlenmiş notlar"
                notes={pinned}
                onMove={(id, to) => actions.move(id, true, to)}
              />
            </div>
          )}
          {others.length > 0 && (
            <div>
              {pinned.length > 0 && <SectionHeading>Diğerleri</SectionHeading>}
              <NoteGrid
                {...grid}
                label={pinned.length > 0 ? "Diğer notlar" : "Notlar"}
                notes={others}
                onMove={(id, to) => actions.move(id, false, to)}
              />
            </div>
          )}
        </>
      )}

      <OfflineInert live={live.live}>
        <MobileNewNote onSave={save} open={mobileComposer} onOpenChange={setMobileComposer} />
      </OfflineInert>
      <Outlet />
      <PendingNotePreview notes={notes} />
    </NotesPage>
  );
}
