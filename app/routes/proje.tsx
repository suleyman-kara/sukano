import { Archive, Info, Trash2, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { data, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "~/components/notes/confirm-dialog";
import { noteBg } from "~/components/notes/colors";
import type { ComposerDraft, ComposerMode } from "~/components/notes/composer";
import { LazyComposer as Composer } from "~/components/notes/lazy-composer";
import { MobileNewNote } from "~/components/notes/mobile-new-note";
import { NoteGrid } from "~/components/notes/note-grid";
import { PendingNotePreview } from "~/components/notes/note-preview";
import { EmptyState, SectionHeading } from "~/components/notes/notes-page";
import {
  UNDO_TOAST_MS,
  useNoteActions,
  usePendingNoteIntents,
} from "~/components/notes/use-note-actions";
import { InviteDialog } from "~/components/projects/project-dialogs";
import { ProjectHeader } from "~/components/projects/project-header";
import { AppShell } from "~/components/shell/app-shell";
import type { View } from "~/components/shell/view-switch";
import { Button } from "~/components/ui/button";
import { trashDaysLeft } from "~/domain/notes/dates";
import { GridLiveStatus, OfflineInert } from "~/components/realtime/live-status";
import { useLiveGrid, type LiveChannelState } from "~/components/realtime/use-live-channel";
import { useProjectChannelGuard } from "~/components/realtime/use-project-guard";
import { applyPendingIntents, type NoteCardData, type NoteView } from "~/domain/notes/optimistic";
import { splitPinned } from "~/domain/notes/ordering";
import type { NoteIntent } from "~/domain/notes/validation";
import { isProjectId } from "~/domain/projects/validation";
import { loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/proje";
import { revalidateGrid } from "~/lib/offline-revalidate";

/** `/proje/:projeId[/arsiv|/cop][/not/:id]` → görünüm. */
export function projectViewOf(pathname: string): NoteView {
  const seg = pathname.split("/")[3];
  return seg === "arsiv" || seg === "cop" ? seg : "notlar";
}

const VIEW_TITLES: Record<NoteView, string> = { notlar: "", arsiv: "Arşiv", cop: "Çöp" };

export const meta: Route.MetaFunction = ({ data: d, location }) => {
  const view = projectViewOf(location.pathname);
  const name = d?.page.project.name ?? "Proje";
  return [{ title: [VIEW_TITLES[view], name, "Sukano"].filter(Boolean).join(" · ") }];
};

/** Yalnızca kendi verisi değişince yüklenir; çevrimdışıyken veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateGrid;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isProjectId(params.projeId)) throw data(null, { status: 404 });
  const view = projectViewOf(new URL(request.url).pathname);
  try {
    const page = await projectsService(getCloudflare(context).env, user.id).page(
      params.projeId,
      view,
    );
    return { page, view, now: new Date().toISOString() };
  } catch (error) {
    loaderError(error);
  }
}

/** Bu projeye ait olmayan (başka alanda oluşturulan) bekleyen notlar sayılmaz. */
function pendingFor(projectId: string, pending: NoteIntent[]) {
  return pending.filter(
    (p) => (p.intent !== "create" && p.intent !== "create-todo") || p.projectId === projectId,
  );
}

type JoinedState = { joined?: { role: string; invitedBy: string | null } };

/**
 * Proje sayfası: başlık, üyeler, "Projeye not ekle" (yönetici ve düzenleyici) ve
 * Notlar · Arşiv · Çöp görünümleri. Görüntüleyicide not ekleme, kart eylemleri ve
 * sürükleme yoktur; görevler madde işaretli görünür (States2 → Görüntüleyici).
 * Açık not alt rotada (`/proje/:projeId/not/:id`, arşivde `/proje/:projeId/arsiv/not/:id`).
 */
export default function ProjectRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const { page, view } = loaderData;
  const { project, permissions, myRole, members } = page;
  const base = `/proje/${project.id}`;
  const views: readonly View[] =
    myRole === "goruntuleyici" ? ["notlar", "arsiv"] : ["notlar", "arsiv", "cop"];
  // Canlı ızgara: proje kanalı (not ekleme, sıralama, renk, arşiv … diğer üyelerden).
  const channel = useMemo(
    () => ({ kind: "project" as const, projectId: project.id }),
    [project.id],
  );
  // Proje silindi / bu kişinin üyeliği değişti: yönlendirme ve toast.
  const guard = useProjectChannelGuard(
    project,
    useMemo(() => members.map((m) => ({ id: m.userId, name: m.name })), [members]),
  );
  const live = useLiveGrid(page.notes, view, channel, { onEvent: guard });
  const notes = applyPendingIntents(
    live.notes,
    pendingFor(project.id, usePendingNoteIntents()),
    view,
  );

  return (
    <AppShell {...shell} showViewSwitch viewSwitch={{ base, views }}>
      <section className="flex flex-col gap-[18px] px-4 pt-2 pb-32 md:gap-6 md:px-7 md:pt-3 md:pb-10 lg:px-8">
        <GridLiveStatus live={live.live} part="banner" />
        <ProjectHeader
          project={project}
          role={myRole}
          members={members}
          canManage={permissions.canManage}
          base={base}
          views={views}
          subtitle={
            view === "arsiv"
              ? "Arşiv · yalnızca bu proje"
              : view === "cop"
                ? "Çöp · 7 gün sonra kalıcı silinir"
                : undefined
          }
        />
        <GridLiveStatus live={live.live} part="sync" />
        {view === "notlar" && (
          <NotesView loaderData={loaderData} notes={notes} base={base} live={live.live} />
        )}
        {view === "arsiv" && <ArchiveView loaderData={loaderData} notes={notes} base={base} />}
        {view === "cop" && <TrashView loaderData={loaderData} notes={notes} />}
        <Outlet />
        <PendingNotePreview notes={notes} />
      </section>
    </AppShell>
  );
}

type ViewProps = {
  loaderData: Route.ComponentProps["loaderData"];
  notes: NoteCardData[];
  base: string;
  live?: LiveChannelState | null;
};

const noopSubscribe = () => () => {};

function JoinedBanner({ projectName }: { projectName: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Gezinme durumu yalnızca tarayıcıda var (yenilemede de korunur): hidrasyondan sonra oku.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const joined = hydrated ? (location.state as JoinedState | null)?.joined : undefined;
  if (!joined) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl bg-primary-soft px-4 py-3 text-primary"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="font-semibold">Projeye katıldın</b>
        <span className="text-[13px]">
          {joined.invitedBy ? `${joined.invitedBy} seni ${projectName} projesine ` : "Seni "}
          {joined.role.toLocaleLowerCase("tr-TR")} olarak ekledi.
        </span>
      </span>
      <button
        type="button"
        aria-label="Kapat"
        onClick={() => navigate(".", { replace: true, state: null, preventScrollReset: true })}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)]"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function NotesView({ loaderData, notes, base, live }: ViewProps) {
  const { project, permissions } = loaderData.page;
  const actions = useNoteActions();
  const navigate = useNavigate();
  const [mobileComposer, setMobileComposer] = useState<ComposerMode | false>(false);
  const [inviting, setInviting] = useState(false);
  const { pinned, others } = splitPinned(notes);
  const canWrite = permissions.canWrite;

  const save = ({ kind, tasks, ...draft }: ComposerDraft) =>
    kind === "todo"
      ? actions.createTodo({
          title: draft.title,
          color: draft.color,
          pinned: draft.pinned,
          tasks,
          projectId: project.id,
        })
      : actions.create({ ...draft, projectId: project.id });

  const grid = {
    view: "notlar" as const,
    actions,
    readOnly: !canWrite,
    hrefFor: (n: { id: string }) => `${base}/not/${n.id}`,
    onVersions: (id: string) =>
      navigate(`${base}/not/${id}?surumler`, { preventScrollReset: true }),
  };
  const startTodo = () => {
    if (window.matchMedia("(min-width: 768px)").matches)
      document.querySelector<HTMLButtonElement>("[aria-label='Yeni yapılacaklar notu']")?.click();
    else setMobileComposer("todo");
  };

  return (
    <>
      <JoinedBanner projectName={project.name} />
      {canWrite && (
        <OfflineInert live={live}>
          <Composer onSave={save} label="Projeye not ekle…" className="max-md:hidden" />
        </OfflineInert>
      )}
      {notes.length === 0 ? (
        <EmptyState
          icon="logo"
          title="Bu projede henüz not yok"
          actions={
            canWrite ? (
              <>
                <Button onClick={startTodo}>Yapılacaklar notu</Button>
                {permissions.canManage && (
                  <Button variant="outline" onClick={() => setInviting(true)}>
                    Davet gönder
                  </Button>
                )}
              </>
            ) : undefined
          }
        >
          {canWrite
            ? "Eklediğin notları projedeki herkes görür ve düzenleyebilir. Kişisel bir notu da projeye taşıyabilirsin."
            : "Yöneticiler ve düzenleyiciler not ekledikçe burada görünür."}
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
                onMove={canWrite ? (id, to) => actions.move(id, true, to) : undefined}
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
                onMove={canWrite ? (id, to) => actions.move(id, false, to) : undefined}
              />
            </div>
          )}
        </>
      )}
      {canWrite && (
        <OfflineInert live={live}>
          <MobileNewNote
            onSave={save}
            open={mobileComposer}
            onOpenChange={setMobileComposer}
            label="Projeye not ekle…"
          />
        </OfflineInert>
      )}
      {permissions.canManage && (
        <InviteDialog open={inviting} onOpenChange={setInviting} project={project} />
      )}
    </>
  );
}

function ArchiveView({ loaderData, notes, base }: ViewProps) {
  const { permissions } = loaderData.page;
  const actions = useNoteActions();
  const navigate = useNavigate();
  if (notes.length === 0) {
    return (
      <EmptyState icon={<Archive strokeWidth={1.75} aria-hidden="true" />} title="Arşiv boş">
        Bu projede arşivlenen notlar burada durur, aramada görünmeye devam eder.
      </EmptyState>
    );
  }
  return (
    <>
      <p className="m-0 text-muted-foreground">
        Arşivlenen notlar burada durur, aramada görünmeye devam eder. Her alanın (Notlarım ve her
        proje) kendi arşivi vardır.
      </p>
      <NoteGrid
        view="arsiv"
        label="Arşivdeki notlar"
        notes={notes}
        actions={actions}
        readOnly={!permissions.canWrite}
        hrefFor={(n) => `${base}/arsiv/not/${n.id}`}
        onVersions={(id) =>
          navigate(`${base}/arsiv/not/${id}?surumler`, { preventScrollReset: true })
        }
      />
    </>
  );
}

function TrashView({ loaderData, notes }: Omit<ViewProps, "base">) {
  const { project, permissions } = loaderData.page;
  const actions = useNoteActions();
  const now = new Date(loaderData.now);
  const [deleting, setDeleting] = useState<NoteCardData | null>(null);
  const [emptying, setEmptying] = useState(false);
  const n = notes.length;

  if (n === 0) {
    return (
      <EmptyState icon={<Trash2 strokeWidth={1.75} aria-hidden="true" />} title="Çöp boş">
        Bu projede çöpe atılan notlar 7 gün burada kalır, sonra kalıcı olarak silinir.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 max-sm:flex-col max-sm:items-stretch max-sm:border-transparent max-sm:bg-warn-soft max-sm:text-warn">
        <span className="flex flex-1 items-start gap-3">
          <Info
            className="mt-0.5 size-5 shrink-0 text-muted-foreground max-sm:text-warn"
            aria-hidden="true"
          />
          <span>Çöpteki notlar 7 gün sonra kalıcı olarak silinir.</span>
        </span>
        {permissions.canWrite && (
          <Button
            variant="outline"
            className="border-danger bg-danger text-white hover:bg-danger/90 max-sm:self-end dark:text-[#141413]"
            onClick={() => setEmptying(true)}
          >
            Çöpü boşalt
          </Button>
        )}
      </div>
      <NoteGrid
        view="cop"
        label="Çöpteki notlar"
        notes={notes}
        actions={actions}
        readOnly={!permissions.canWrite}
        now={now}
        onVersions={() => {}}
        onRequestDelete={setDeleting}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        icon={<Trash2 className="size-5" />}
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
        icon={<Trash2 className="size-5" />}
        title="Çöp boşaltılsın mı?"
        description={`${project.name} çöpündeki ${n} not, sürümleri ve ekleriyle birlikte kalıcı olarak silinir. Bu işlem geri alınamaz.`}
        note={
          <>
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Yalnızca bu projenin çöpü boşalır. Notlarım ve diğer projeler etkilenmez.</span>
          </>
        }
        confirmLabel="Çöpü boşalt"
        onConfirm={() => {
          void actions.run({ intent: "empty-trash", projectId: project.id });
          toast("Çöp boşaltıldı", { duration: UNDO_TOAST_MS });
        }}
      />
    </>
  );
}
