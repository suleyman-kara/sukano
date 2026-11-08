import { Info, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/notes/confirm-dialog";
import { noteBg } from "~/components/notes/colors";
import { NoteGrid } from "~/components/notes/note-grid";
import { EmptyState, NotesPage } from "~/components/notes/notes-page";
import { useNoteActions, usePendingNoteIntents } from "~/components/notes/use-note-actions";
import { Button } from "~/components/ui/button";
import { trashDaysLeft } from "~/domain/notes/dates";
import { PERSONAL_CHANNEL, useLiveGrid } from "~/components/realtime/use-live-channel";
import { applyPendingIntents, type NoteCardData } from "~/domain/notes/optimistic";
import { getCloudflare } from "~/lib/context";
import { personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/cop";
import { revalidateUnlessOffline } from "~/lib/offline-revalidate";

export const meta: Route.MetaFunction = () => [{ title: "Çöp · Notlarım · Sukano" }];

/** Çevrimdışıyken ekrandaki veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateUnlessOffline;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return {
    notes: await personalNotes(getCloudflare(context).env, user.id).list("cop"),
    now: new Date().toISOString(),
  };
}

export default function TrashRoute({ loaderData }: Route.ComponentProps) {
  const actions = useNoteActions();
  const live = useLiveGrid(loaderData.notes, "cop", PERSONAL_CHANNEL);
  const notes = applyPendingIntents(live.notes, usePendingNoteIntents(), "cop");
  const now = new Date(loaderData.now);
  const [deleting, setDeleting] = useState<NoteCardData | null>(null);
  const [emptying, setEmptying] = useState(false);
  const n = notes.length;

  return (
    <NotesPage subtitle="Çöp · 7 gün sonra kalıcı silinir" live={live.live}>
      {n === 0 ? (
        <EmptyState icon={<Trash2 strokeWidth={1.75} aria-hidden="true" />} title="Çöp boş">
          Çöpe attığın notlar 7 gün burada kalır, sonra kalıcı olarak silinir.
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 max-sm:flex-col max-sm:items-stretch max-sm:border-transparent max-sm:bg-warn-soft max-sm:text-warn">
            <span className="flex flex-1 items-start gap-3">
              <Info
                className="mt-0.5 size-5 shrink-0 text-muted-foreground max-sm:text-warn"
                aria-hidden="true"
              />
              <span>Çöpteki notlar 7 gün sonra kalıcı olarak silinir.</span>
            </span>
            <Button
              variant="outline"
              className="border-danger bg-danger text-white hover:bg-danger/90 max-sm:self-end dark:text-[#141413]"
              onClick={() => setEmptying(true)}
            >
              Çöpü boşalt
            </Button>
          </div>
          <NoteGrid
            view="cop"
            label="Çöpteki notlar"
            notes={notes}
            actions={actions}
            now={now}
            onVersions={() => {}}
            onRequestDelete={setDeleting}
          />
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Not kalıcı olarak silinsin mi?"
        chip={
          deleting && (
            <>
              <b className="flex-1 truncate font-semibold">{deleting.title || "Başlıksız not"}</b>
              <small className="shrink-0 text-xs text-muted-foreground">
                Çöpte · {trashDaysLeft(new Date(deleting.trashedAt ?? now), now)} gün kaldı
              </small>
            </>
          )
        }
        chipStyle={
          deleting ? { background: noteBg(deleting.color), borderColor: "transparent" } : undefined
        }
        description="Not, sürüm geçmişi ve ekleri silinir. Bu işlem geri alınamaz."
        confirmLabel="Kalıcı olarak sil"
        onConfirm={() => deleting && actions.deletePermanently(deleting.id)}
      />
      <ConfirmDialog
        open={emptying}
        onOpenChange={setEmptying}
        title="Çöp boşaltılsın mı?"
        description={`Notlarım çöpündeki ${n} not, sürümleri ve ekleriyle birlikte kalıcı olarak silinir. Bu işlem geri alınamaz.`}
        note={
          <>
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Yalnızca Notlarım çöpü boşalır. Projeler etkilenmez.</span>
          </>
        }
        confirmLabel="Çöpü boşalt"
        onConfirm={() => actions.emptyTrash()}
      />
    </NotesPage>
  );
}
