import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Copy,
  FolderInput,
  FolderOutput,
  History,
  Keyboard,
  ListChecks,
  Lock,
  MoreVertical,
  Palette,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate, useRevalidator, useSubmit } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import {
  AttachButton,
  AttachmentStrip,
  DropOverlay,
} from "~/components/attachments/attachment-list";
import {
  hasFiles,
  MESSAGES as ATTACHMENT_MESSAGES,
  pastedFiles,
  useNoteAttachments,
} from "~/components/attachments/use-note-attachments";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { useLiveConfig } from "~/components/realtime/live-context";
import { ReminderChip } from "~/components/reminders/reminder-chip";
import { ReminderControl } from "~/components/reminders/reminder-picker";
import {
  browserTimeZone,
  useNoteReminder,
  useTaskReminders,
  type TaskReminderControl,
} from "~/components/reminders/use-reminders";
import { OfflineBanner, SyncStatus, useOfflineShown } from "~/components/realtime/live-status";
import { PresenceAvatars } from "~/components/realtime/presence-avatars";
import { useLiveNote, type LiveNote } from "~/components/realtime/use-live-note";
import type { TodoPeople } from "~/components/tasks/person-picker";
import {
  COARSE_QUERY,
  editorHandlesEscape,
  TodoEditor,
  type TodoEditorHandle,
} from "~/components/tasks/todo-editor";
import type { NoteColor } from "~/db/schema";
import { authorshipLine } from "~/domain/notes/authorship";
import { formatShortDateTime } from "~/domain/notes/dates";
import { remoteNoteOutcome, type RemoteNoteOutcome } from "~/domain/realtime/live-ui";
import type { NoteMetaPatch } from "~/domain/realtime/protocol";
import { TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import type { NoteDetail } from "~/lib/notes.server";
import type { NoteReminders } from "~/lib/reminders.server";
import { DEFAULT_TIME_ZONE } from "~/domain/reminders/time";
import { useContentRevalidator } from "~/lib/offline-revalidate";
import { ColorPalette } from "./color-palette";
import { noteBg } from "./colors";
import { useConvertNote } from "./convert-note";
import { closeToCard, enteredFromPreview, focusCard, useCardToModalEnter } from "./card-to-modal";
import { MoveCopyDialog } from "./move-copy";
import { canWriteNote, PERSONAL_ACCESS, type MoveTarget, type NoteAccessInfo } from "./note-access";
import {
  NoteMoreMenuContent,
  NoteSheet,
  type MoveCopyEntry,
  type TodoMenuHandlers,
} from "./note-menu";
import { FormattingToolbar, NoteEditorContent, useNoteEditor } from "./note-editor";
import { NOTES_ACTION, useNoteActions } from "./use-note-actions";
import { VersionHistory } from "./version-history";

/** Otomatik kayıt gecikmesi (ms). */
export const AUTOSAVE_DELAY_MS = 800;

type NoteDialogProps = {
  note: NoteDetail;
  /** Kapanınca gidilecek adres (ızgara). */
  closeTo: string;
  /** Sürüm geçmişi açık başlasın (`?surumler`). */
  initialVersionsOpen?: boolean;
  /** "Taşı veya kopyala…" açık başlasın (karttan, `?tasi`). */
  initialMoveOpen?: boolean;
  /** Notun alanı ve rol (varsayılan: kişisel not). */
  access?: NoteAccessInfo;
  /** "Taşı veya kopyala…" / "Kopyala…" hedefleri (üyesi olunan projeler). */
  targets?: readonly MoveTarget[];
  /** Gönderilmemiş not ve görev hatırlatıcıları (Aşama 5b). */
  reminders?: NoteReminders;
  /** Kişinin saat dilimi (hatırlatıcı saatleri). */
  timeZone?: string;
  /** Hatırlatıcı seçici açık başlasın (karttan, `?hatirlatici`). */
  initialReminderOpen?: boolean;
};

const NO_REMINDERS: NoteReminders = { note: null, tasks: {} };

const NO_TARGETS: readonly MoveTarget[] = [];
const NO_FILES: NonNullable<NoteDetail["attachments"]> = [];

const IB =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-expanded:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)] [&_svg]:size-5 pointer-coarse:size-11";

/**
 * Açık not. Masaüstü ve tablette ortalanmış modal, mobilde tam ekran. Başlık ve
 * gövde 800 ms sonra kendiliğinden kaydedilir; kapatırken bekleyen değişiklik
 * hemen gönderilir.
 */
export function NoteDialog({
  note,
  closeTo,
  initialVersionsOpen = false,
  initialMoveOpen = false,
  access = PERSONAL_ACCESS,
  targets = NO_TARGETS,
  reminders = NO_REMINDERS,
  timeZone = DEFAULT_TIME_ZONE,
  initialReminderOpen = false,
}: NoteDialogProps) {
  const navigate = useNavigate();
  const actions = useNoteActions();
  const { me } = useLiveConfig();
  const revalidator = useRevalidator();
  const content = useContentRevalidator();
  const tabletUp = useMediaQuery(TABLET_UP_QUERY, true);
  const coarse = useMediaQuery(COARSE_QUERY, false);
  const todoRef = useRef<TodoEditorHandle>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const convert = useConvertNote();
  const isTodo = note.kind === "todo";
  const [revision, setRevision] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(initialVersionsOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [color, setColor] = useState<NoteColor>(note.color);
  const [pinned, setPinned] = useState(note.pinned);
  /** Başka yerden gelen başlık (not odası `not` iletisi); her gelişte yeni nesne. */
  const [remoteTitle, setRemoteTitle] = useState<{ title: string } | null>(null);
  /** Not açıkken başka biri çöpe attı. */
  const [trashedLive, setTrashedLive] = useState(false);
  const archived = note.archivedAt !== null;
  const project = access.kind === "project" ? access : null;
  const canWrite = canWriteNote(access);
  const viewer = !canWrite;
  // Canlı katman (not odası): ortak düzenleme, varlık, görev yayınları, başka yerden gelen
  // başlık / renk / sabit. Kapalıysa (sağlayıcı yok) `null`: eski HTTP davranışı.
  /** Başka yerden gelen yıkıcı değişiklik (çöp, arşiv, taşıma) işleyicisi; aşağıda bağlanır. */
  const onRemote = useRef<(m: NoteMetaPatch & { by: string }) => void>(() => {});
  const live = useLiveNote({
    noteId: note.id,
    kind: note.kind,
    readOnly: viewer,
    enabled: note.trashedAt === null,
    onMeta: (m) => {
      if (m.title !== undefined) setRemoteTitle({ title: m.title });
      if (m.color !== undefined) setColor(m.color as NoteColor);
      if (m.pinned !== undefined) setPinned(m.pinned);
      if (m.trashed !== undefined) setTrashedLive(m.trashed);
      // Başka yerden ek eklendi / kaldırıldı: ek listesi loader'dan yeniden gelir.
      if (m.attachments) void content.revalidate();
      onRemote.current(m);
    },
    // Sunucu düzenlemeyi reddetti (görüntüleyici, rolü düşürülen): tek toast.
    onError: (message) => toast.error(message, { id: `salt-okunur:${note.id}` }),
  });
  // Çevrimdışı bandı (kısa kopmalarda gecikmeli); düzenleme `live.canWrite` ile hemen kapanır.
  const offline = useOfflineShown(live?.status) && !live?.fatal;
  // Çevrimdışıyken düzenleme kapalı (PLAN §5); metin gövdesi ayrıca eşitleme bekler.
  const editable =
    note.trashedAt === null && !trashedLive && canWrite && (live ? live.canWrite : true);
  // Dosya ekleri (yalnızca metin notu): yükleme, iyimser kaldırma, sürükle-bırak, yapıştır.
  const files = useNoteAttachments({
    noteId: note.id,
    server: note.attachments ?? NO_FILES,
    canAdd: editable && !isTodo,
  });
  const [moveOpen, setMoveOpen] = useState(initialMoveOpen);
  // Hatırlatıcılar: not düzeyi (seçici + çip) ve görevlerin "Hatırlat" anahtarı.
  const noteReminder = useNoteReminder(note.id, reminders.note);
  const taskReminders = useTaskReminders(note.id, reminders.tasks);
  const [reminderOpen, setReminderOpen] = useState(initialReminderOpen && editable);
  const reminderProps = {
    open: reminderOpen,
    onOpenChange: setReminderOpen,
    noteTitle: note.title,
    value: noteReminder.at,
    // Seçici yalnızca açıkken (istemcide) çizilir: tarayıcının saat dilimi kullanılır,
    // kaydederken sunucuya da o gider.
    timeZone: reminderOpen ? (browserTimeZone() ?? timeZone) : timeZone,
    audience: project
      ? {
          kind: "project" as const,
          members: project.members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
        }
      : { kind: "personal" as const },
    onSave: async (date: string, time: string) => {
      const ok = await noteReminder.save(date, time);
      if (ok) setReminderOpen(false);
      return ok;
    },
    onClear: async () => {
      const ok = await noteReminder.clear();
      if (ok) setReminderOpen(false);
      return ok;
    },
  };
  const reminderChip =
    noteReminder.at !== null ? (
      <ReminderChip
        at={noteReminder.at}
        timeZone={noteReminder.zone ?? timeZone}
        onClick={editable ? () => setReminderOpen(true) : undefined}
      />
    ) : null;
  const people = useMemo(
    () => (project ? { members: project.members, canAssign: canWrite } : undefined),
    [project, canWrite],
  );

  const saver = useAutosave(note.id);
  const [openedAt] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));

  /**
   * Bekleyen görev işlemlerini (ve canlı metin notunda odadaki değişikliklerin D1'e yazımını)
   * gönderir. Izgara, görev eşitleyicisi boşta kalınca kendiliğinden yeniden doğrulanır
   * (`useTodoTasks`); kapanış bunu beklemez.
   */
  const liveFlush = live?.flush;
  const flushTasks = useCallback(() => {
    const pending = todoRef.current?.flush();
    const saved = note.kind === "text" ? liveFlush?.() : undefined;
    return Promise.all([pending, saved]).then(() => {});
  }, [liveFlush, note.kind]);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  // Yükleme sürerken önizleme açıldıysa örtü zaten ekranda: yeniden solmaz.
  const [fromPreview] = useState(() => enteredFromPreview(note.id));
  const enterFromCard = useCardToModalEnter(note.id, reduced);
  const setContent = useCallback(
    (el: HTMLDivElement | null) => {
      contentRef.current = el;
      enterFromCard(el);
    },
    [enterFromCard],
  );
  const closing = useRef(false);
  /**
   * Kapanış hareketi bitti: diyalog hemen kalkar (örtü ve odak kilidi ızgarayı bırakır),
   * adres değişimi arkada tamamlanır. Izgaranın verisi zaten elde; gezinme ağ beklemez.
   */
  const [hidden, setHidden] = useState(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    saver.flush();
    void flushTasks();
    // Kartın yerine küçülerek kapanır (azaltılmış harekette anında).
    closeToCard(note.id, contentRef.current, reduced, () => {
      setHidden(true);
      void navigate(closeTo, { preventScrollReset: true });
    });
  }, [saver, flushTasks, navigate, closeTo, note.id, reduced]);

  const leave = (fn: () => void) => {
    saver.flush();
    void flushTasks().then(fn);
    setHidden(true);
    void navigate(closeTo, { preventScrollReset: true });
  };

  // Başka biri notu çöpe attı / arşivledi / taşıdı ya da erişim kalktı: bekleyen yazım
  // (başlık, görevler, Yjs → D1) önce gönderilir, sonra not kapanır ve toast söyler.
  const closedRemotely = useRef(false);
  const closeRemotely = (outcome: RemoteNoteOutcome) => {
    if (closedRemotely.current || !outcome.close) return;
    closedRemotely.current = true;
    saver.flush();
    void flushTasks();
    navigate(closeTo, { preventScrollReset: true });
    const t = outcome.toast;
    if (!t) return;
    const undo =
      t.undo && canWrite
        ? t.undo === "restore"
          ? { label: "Geri yükle", onClick: () => actions.restore(note.id) }
          : { label: "Arşivden çıkar", onClick: () => actions.unarchive(note.id) }
        : undefined;
    toast(t.title, { description: t.description, action: undo, id: `uzak:${note.id}` });
  };
  useEffect(() => {
    onRemote.current = (m) =>
      closeRemotely(
        remoteNoteOutcome(m, {
          me: me?.id ?? null,
          people: project?.members,
          view: archived ? "arsiv" : "notlar",
        }),
      );
  });
  // Erişim kalktı (projeden çıkarıldın, not kalıcı silindi): oda 4404 ile kapandı.
  const fatal = live?.fatal ?? false;
  useEffect(() => {
    if (!fatal) return;
    closeRemotely({
      close: true,
      toast: {
        title: "Bu nota artık erişemiyorsun",
        description: "Not silinmiş ya da erişimin kaldırılmış olabilir.",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatal]);
  // Rol düşürüldü (düzenleyici → görüntüleyici): düzenleme kapanır, rol yeniden yüklenir.
  const liveReadOnly = live?.readOnly ?? false;
  const [seenReadOnly, setSeenReadOnly] = useState(liveReadOnly);
  if (seenReadOnly !== liveReadOnly) {
    setSeenReadOnly(liveReadOnly);
    if (liveReadOnly && canWrite) {
      toast("Rolün değişti", {
        description: "Artık görüntüleyicisin; not salt okunur.",
        id: `rol:${note.id}`,
      });
      void revalidator.revalidate();
    }
  }

  const changeColor = (c: NoteColor) => {
    setColor(c);
    actions.setColor(note.id, c);
  };
  const togglePin = () => {
    setPinned((p) => !p);
    actions.setPinned(note.id, !pinned);
  };

  const edited = `Düzenlendi ${formatShortDateTime(new Date(note.updatedAt))}`;
  const moveCopy: MoveCopyEntry | null = editable
    ? {
        label: project ? "Kopyala…" : "Taşı veya kopyala…",
        onSelect: () => {
          saver.flush();
          setMoveOpen(true);
        },
      }
    : null;
  const meta = project ? (
    <p
      className="m-0 truncate text-xs text-muted-foreground"
      data-testid="not-yazarlari"
      suppressHydrationWarning
    >
      {authorshipLine(note.createdBy, note.updatedBy, new Date(note.updatedAt))}
    </p>
  ) : null;
  const onArchive = () =>
    leave(() => (archived ? actions.unarchive(note.id) : actions.archive(note.id)));
  const onTrash = () => leave(() => actions.trash(note.id));
  const onDuplicate = () => {
    saver.flush();
    void flushTasks().then(() => actions.duplicate(note.id));
  };
  const openVersions = () => {
    saver.flush();
    void flushTasks().then(() => setVersionsOpen(true));
  };
  const onConvert = () =>
    convert.ask({
      id: note.id,
      to: isTodo ? "text" : "todo",
      attachmentCount: note.attachmentCount,
      before: async () => {
        await waitForSaver(saver);
        await flushTasks();
      },
    });
  const todoMenu: TodoMenuHandlers | undefined = isTodo
    ? {
        onExpandAll: () => todoRef.current?.expandAll(),
        onCollapseAll: () => todoRef.current?.collapseAll(),
        onClearCompleted: () => todoRef.current?.clearCompleted(),
      }
    : undefined;

  const presence = live ? (
    <PresenceAvatars
      peers={live.peers}
      size={tabletUp ? 28 : 26}
      className="[--presence-ring:var(--note-bg)]"
    />
  ) : null;

  return (
    <Dialog open={!hidden} onOpenChange={(o) => !o && close()}>
      <DialogContent
        ref={setContent}
        showCloseButton={false}
        overlayClassName={cn(
          // Kapanırken saydamlaşan örtü tıklamayı tutmaz: ızgara hemen kullanılabilir.
          "data-closed:pointer-events-none",
          fromPreview && "data-open:animate-none",
        )}
        data-canli={live?.status ?? "kapali"}
        data-canli-kisi={live?.peers.length ?? 0}
        data-salt-okunur={live?.readOnly ? "" : undefined}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => {
          // Görev satırı, ayrıntı ve seçicide Esc katmanlıdır; not kapanmaz.
          if (editorHandlesEscape(e.target)) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Dokunmatikte kartı açan dokunuşun gecikmiş işaretçi olayları diyaloğu
          // hemen kapatmasın.
          if (performance.now() - openedAt < 600) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          // Radix ilk alana odaklanıp metni seçer; bunun yerine diyalogun kendisine odaklan.
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          // Odak açılan kartın bağlantısına döner (ızgarada yoksa Radix'in varsayılanı).
          if (focusCard(note.id)) e.preventDefault();
        }}
        className={cn(
          // Açılış hareketi `useCardToModalEnter` ile (karttan büyür); CSS girişi kapalı.
          // Kapanış hareketi `closeToCard` ile oynar; Radix'in çıkışı beklenmez.
          "flex flex-col gap-0 overflow-hidden p-0 text-fg ring-0 data-open:animate-none data-closed:animate-none",
          tabletUp
            ? cn(
                "top-[60px] max-h-[calc(100dvh-120px)] w-[calc(100%-2rem)] max-w-[680px] translate-y-0 rounded-2xl shadow-elevated sm:max-w-[680px]",
                // Tamamlananlar inince diyalog kısalmasın (TodoNote min-height:640px).
                isTodo && "h-[min(760px,calc(100dvh-100px))] max-h-[calc(100dvh-100px)]",
              )
            : "inset-0 top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:max-w-none",
        )}
        style={{ background: noteBg(color), ["--note-bg" as string]: noteBg(color) }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = files.canAdd ? "copy" : "none";
          if (files.canAdd) files.setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) files.setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          files.setDragging(false);
          if (files.canAdd) files.addFiles(Array.from(e.dataTransfer.files));
          else if (editable && isTodo) toast(ATTACHMENT_MESSAGES.textOnly);
        }}
        onPasteCapture={(e) => {
          const list = files.canAdd ? pastedFiles(e) : [];
          if (list.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          files.addFiles(list);
        }}
      >
        <DropOverlay show={files.dragging} />
        <DialogTitle className="sr-only">{note.title || "Başlıksız not"}</DialogTitle>
        <DialogDescription className="sr-only">
          {editable
            ? "Değişiklikler otomatik kaydedilir."
            : viewer
              ? "Salt okunur. Okur ve arar; not ekleyemez, görev işaretleyemez."
              : "Çöpteki not salt okunurdur."}
        </DialogDescription>
        <NoteBody
          key={`${note.id}:${note.kind}:${revision}:${live?.generation ?? 0}`}
          note={note}
          live={live}
          remoteTitle={remoteTitle}
          todoRef={todoRef}
          onHelpChange={setHelpOpen}
          editable={editable}
          tabletUp={tabletUp}
          saver={saver}
          header={(titleInput) =>
            tabletUp ? (
              <div className="flex items-center gap-2.5 pt-[18px] pr-5 pb-1 pl-7">
                {titleInput}
                {presence}
                {viewer && <ViewerBadge />}
                <PinButton pinned={pinned} onClick={togglePin} hidden={archived || !editable} />
                <button
                  type="button"
                  className={IB}
                  aria-label="Kapat"
                  title="Kapat"
                  onClick={close}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-0.5 px-2 pt-[max(12px,env(safe-area-inset-top))]">
                <button type="button" className={IB} aria-label="Geri" onClick={close}>
                  <ArrowLeft aria-hidden="true" />
                </button>
                <span className="flex-1" />
                {presence}
                {viewer ? (
                  <>
                    <ViewerBadge />
                    <button
                      type="button"
                      className={IB}
                      aria-label="Sürüm geçmişi"
                      onClick={openVersions}
                    >
                      <History aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <PinButton pinned={pinned} onClick={togglePin} hidden={archived || !editable} />
                    <ReminderControl
                      {...reminderProps}
                      trigger={
                        <button
                          type="button"
                          className={cn(IB, noteReminder.at !== null && "text-primary")}
                          disabled={!editable}
                          aria-label="Not hatırlatıcısı"
                          aria-haspopup="dialog"
                          onClick={() => setReminderOpen(true)}
                        >
                          <Bell aria-hidden="true" />
                        </button>
                      }
                    />
                    <button
                      type="button"
                      className={IB}
                      aria-label="Diğer"
                      aria-haspopup="dialog"
                      onClick={() => setSheetOpen(true)}
                    >
                      <MoreVertical aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )
          }
          footer={
            tabletUp && viewer ? (
              <div className="flex shrink-0 items-center gap-0.5 border-t border-line pt-2.5 pr-3.5 pb-3 pl-[18px]">
                <button
                  type="button"
                  className={IB}
                  aria-label="Sürüm geçmişi"
                  title="Sürüm geçmişi"
                  onClick={openVersions}
                >
                  <History aria-hidden="true" />
                </button>
                <span className="flex-1" />
                <Button variant="outline" onClick={close}>
                  Kapat
                </Button>
              </div>
            ) : tabletUp ? (
              <div className="relative flex shrink-0 flex-wrap items-center gap-0.5 pt-2 pr-3.5 pb-3 pl-[18px]">
                <ColorButton color={color} onChange={changeColor} />
                <ReminderControl
                  {...reminderProps}
                  trigger={
                    <button
                      type="button"
                      className={cn(IB, noteReminder.at !== null && "text-primary")}
                      disabled={!editable}
                      aria-label="Not hatırlatıcısı"
                      title="Not hatırlatıcısı"
                      aria-haspopup="dialog"
                    >
                      <Bell aria-hidden="true" />
                    </button>
                  }
                />
                {!isTodo && (
                  <AttachButton canAdd={files.canAdd} onFiles={files.addFiles} className={IB} />
                )}
                {moveCopy && (
                  <button
                    type="button"
                    className={IB}
                    aria-label={moveCopy.label}
                    title={moveCopy.label}
                    aria-haspopup="dialog"
                    onClick={moveCopy.onSelect}
                  >
                    {project ? (
                      <FolderOutput aria-hidden="true" />
                    ) : (
                      <FolderInput aria-hidden="true" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={IB}
                  aria-label="Kopyasını oluştur"
                  title="Kopyasını oluştur"
                  onClick={onDuplicate}
                >
                  <Copy aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={IB}
                  aria-label="Sürüm geçmişi"
                  title="Sürüm geçmişi"
                  onClick={openVersions}
                >
                  <History aria-hidden="true" />
                </button>
                {!isTodo && (
                  <button
                    type="button"
                    className={IB}
                    aria-label="Yapılacaklar notuna dönüştür"
                    title="Yapılacaklar notuna dönüştür"
                    onClick={onConvert}
                  >
                    <ListChecks aria-hidden="true" />
                  </button>
                )}
                <span
                  className="mx-1.5 h-5 w-px bg-[color-mix(in_srgb,var(--fg)_16%,transparent)]"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={IB}
                  aria-label={archived ? "Arşivden çıkar" : "Arşivle"}
                  title={archived ? "Arşivden çıkar" : "Arşivle"}
                  onClick={onArchive}
                >
                  {archived ? (
                    <ArchiveRestore aria-hidden="true" />
                  ) : (
                    <Archive aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={IB}
                  aria-label="Çöpe at"
                  title="Çöpe at"
                  onClick={onTrash}
                >
                  <Trash2 aria-hidden="true" />
                </button>
                {isTodo && !coarse && (
                  <button
                    type="button"
                    className={cn(IB, helpOpen && "bg-primary-soft text-primary")}
                    aria-label="Klavye kısayolları (Ctrl+/)"
                    title="Kısayollar (Ctrl+/)"
                    aria-expanded={helpOpen}
                    onClick={() => todoRef.current?.toggleHelp()}
                  >
                    <Keyboard aria-hidden="true" />
                  </button>
                )}
                {isTodo && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={IB} aria-label="Diğer" title="Diğer">
                        <MoreVertical aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <NoteMoreMenuContent
                      kind={note.kind}
                      todo={todoMenu}
                      onDuplicate={onDuplicate}
                      onVersions={openVersions}
                      onConvert={onConvert}
                      moveCopy={moveCopy}
                      dialog={{ archived, onArchive, onTrash }}
                    />
                  </DropdownMenu>
                )}
                <span className="flex-1 px-3 text-right text-xs text-muted-foreground">
                  {offline ? (
                    <SyncStatus at={live?.lastSyncedAt ?? null} />
                  ) : project ? null : (
                    edited
                  )}
                </span>
                <Button
                  variant="outline"
                  className="border-[color-mix(in_srgb,var(--fg)_20%,transparent)] bg-transparent"
                  onClick={close}
                >
                  Kapat
                </Button>
              </div>
            ) : null
          }
          mobileExtras={(toolbar) => (
            <>
              {viewer && (
                <p className="m-0 mt-3 text-[13px] text-muted-foreground">
                  Sana atanan görevi de işaretleyemezsin; rol için proje yöneticisine yaz.
                </p>
              )}
              {offline ? (
                <SyncStatus at={live?.lastSyncedAt ?? null} className="mt-4" />
              ) : (
                !project && <p className="m-0 mt-4 text-xs text-muted-foreground">{edited}</p>
              )}
              {toolbar}
            </>
          )}
          meta={meta}
          lockbar={
            offline || viewer ? (
              <>
                {offline && <OfflineBanner onRetry={live?.reconnect} />}
                {viewer && <LockBar />}
              </>
            ) : null
          }
          people={people}
          reminderChip={reminderChip}
          taskReminders={editable ? taskReminders : undefined}
          colorButton={<ColorButton color={color} onChange={changeColor} />}
          attachments={
            isTodo ? null : (
              <AttachmentStrip attachments={files} editable={editable} stacked={!tabletUp} />
            )
          }
          attachButton={
            !tabletUp && !isTodo ? (
              <AttachButton canAdd={files.canAdd} onFiles={files.addFiles} className={IB} />
            ) : null
          }
        />

        {!tabletUp && !viewer && (
          <NoteSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title={note.title}
            kind={note.kind}
            color={color}
            pinned={pinned}
            archived={archived}
            onColor={changeColor}
            onPin={togglePin}
            onArchive={onArchive}
            onTrash={onTrash}
            onDuplicate={onDuplicate}
            onVersions={openVersions}
            onConvert={onConvert}
            todo={todoMenu}
            moveCopy={moveCopy}
            onReminder={editable ? () => setReminderOpen(true) : undefined}
            footer={
              <p className="m-0 px-1.5 pt-1 text-xs text-muted-foreground">
                {project ? meta : edited}
              </p>
            }
          />
        )}

        <VersionHistory
          noteId={note.id}
          noteTitle={note.title}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          onRestored={() => setRevision((r) => r + 1)}
          canRestore={canWrite}
        />
        {convert.dialog}
        {moveCopy && (
          <MoveCopyDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            note={{ id: note.id, title: note.title, color }}
            source={project ? { kind: "project", project: project.project } : { kind: "personal" }}
            targets={targets}
            before={async () => {
              await waitForSaver(saver);
              await flushTasks();
            }}
            onMoved={() => navigate(closeTo, { preventScrollReset: true })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PinButton({
  pinned,
  onClick,
  hidden,
}: {
  pinned: boolean;
  onClick: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      className={cn(IB, pinned && "text-primary hover:text-primary")}
      aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
      title={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
      aria-pressed={pinned}
      onClick={onClick}
    >
      <Pin fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

/** "Görüntüleyici" kilitli rozeti (States2, TViewerNote `.role.ro`). */
function ViewerBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hover px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-muted-foreground">
      <Lock className="size-3.5" aria-hidden="true" />
      Görüntüleyici
    </span>
  );
}

/** Salt okunur açıklaması (TViewerNote `.lockbar`). */
function LockBar() {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl bg-hover px-3.5 py-3 text-[13px] text-muted-foreground"
    >
      <Lock className="mt-px size-[18px] shrink-0" aria-hidden="true" />
      <span>
        <b className="font-semibold text-fg">Salt okunur.</b> Okur ve arar; not ekleyemez, görev
        işaretleyemez.
      </span>
    </div>
  );
}

function ColorButton({ color, onChange }: { color: NoteColor; onChange: (c: NoteColor) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={IB} aria-label="Renk" title="Renk">
          <Palette aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-auto max-w-[calc(100vw-2rem)] rounded-xl p-2.5"
      >
        <ColorPalette value={color} onChange={onChange} className="flex-wrap" />
      </PopoverContent>
    </Popover>
  );
}

type Patch = { title?: string; bodyHtml?: string };
type Submitter = (form: Record<string, string>) => void;

/** Otomatik kayıt durumu; React dışında tutulur, bileşen yalnızca gönderim işlevlerini bağlar. */
export function createSaver(noteId: string, delay = AUTOSAVE_DELAY_MS) {
  const s = {
    pending: null as Patch | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    busy: false,
    /** Sıradaki istek (tek fetcher; aynı anda biri uçar). */
    submit: null as Submitter | null,
    /** Kapatırken: fetcher meşgulse bağımsız bir istekle hemen gönder. */
    submitNow: null as Submitter | null,
    form(patch: Patch) {
      const form: Record<string, string> = { intent: "update", id: noteId };
      if (patch.title !== undefined) form.title = patch.title;
      if (patch.bodyHtml !== undefined) form.bodyHtml = patch.bodyHtml;
      return form;
    },
    clearTimer() {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
    },
    send() {
      s.clearTimer();
      if (!s.pending || s.busy || !s.submit) return;
      const patch = s.pending;
      s.pending = null;
      s.busy = true;
      s.submit(s.form(patch));
    },
    change(patch: Patch) {
      s.pending = { ...s.pending, ...patch };
      s.clearTimer();
      s.timer = setTimeout(s.send, delay);
    },
    flush() {
      s.clearTimer();
      if (!s.pending) return;
      if (!s.busy) return s.send();
      const patch = s.pending;
      s.pending = null;
      s.submitNow?.(s.form(patch));
    },
  };
  return s;
}

type Saver = ReturnType<typeof createSaver>;

/** Bekleyen kayıt gönderilip yanıtlanana kadar bekler (dönüşümden önce; en çok ~3 sn). */
async function waitForSaver(saver: Saver) {
  saver.flush();
  for (let i = 0; i < 60 && (saver.busy || saver.pending); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Debounce'lu otomatik kayıt. Aynı anda tek istek uçar; uçarken gelen değişiklik
 * istek bitince gönderilir (sıra korunur).
 */
function useAutosave(noteId: string): Saver {
  const fetcher = useFetcher({ key: `not-kaydet:${noteId}` });
  const submit = useSubmit();
  const [saver] = useState(() => createSaver(noteId));
  const busy = fetcher.state !== "idle";
  const fetcherSubmit = fetcher.submit;

  useEffect(() => {
    Object.assign(saver, {
      busy,
      submit: (form: Record<string, string>) =>
        void fetcherSubmit(form, { method: "post", action: NOTES_ACTION }),
      submitNow: (form: Record<string, string>) =>
        void submit(form, { method: "post", action: NOTES_ACTION, navigate: false }),
    });
    if (!busy && saver.pending && !saver.timer) saver.send();
  }, [saver, busy, fetcherSubmit, submit]);

  useEffect(() => () => saver.clearTimer(), [saver]);

  return saver;
}

type NoteBodyProps = {
  note: NoteDetail;
  /** Canlı katman (null: kapalı, eski HTTP davranışı). */
  live: LiveNote | null;
  remoteTitle: { title: string } | null;
  todoRef: React.Ref<TodoEditorHandle>;
  onHelpChange: (open: boolean) => void;
  editable: boolean;
  tabletUp: boolean;
  saver: Saver;
  header: (titleInput: React.ReactNode) => React.ReactNode;
  footer: React.ReactNode;
  mobileExtras: (toolbar: React.ReactNode) => React.ReactNode;
  colorButton: React.ReactNode;
  /** Metin notunun ekleri (görseller, dosyalar, yüklemeler). */
  attachments?: React.ReactNode;
  /** Mobil biçimlendirme çubuğunda "Dosya ekle". */
  attachButton?: React.ReactNode;
  /** Proje notu: oluşturan / son düzenleyen satırı. */
  meta?: React.ReactNode;
  /** Görüntüleyici: salt okunur açıklaması. */
  lockbar?: React.ReactNode;
  people?: TodoPeople;
  /** Kurulu not hatırlatıcısı çipi. */
  reminderChip?: React.ReactNode;
  /** Görevlerin "Hatırlat" anahtarı (düzenlenebilir yapılacaklar notunda). */
  taskReminders?: TaskReminderControl;
};

function NoteBody({
  note,
  live,
  remoteTitle,
  todoRef,
  onHelpChange,
  editable,
  tabletUp,
  saver,
  header,
  footer,
  mobileExtras,
  colorButton,
  attachments,
  attachButton,
  meta,
  lockbar,
  people,
  reminderChip,
  taskReminders,
}: NoteBodyProps) {
  const [title, setTitle] = useState(note.title);
  const [titleFocused, setTitleFocused] = useState(false);
  // Başka yerden gelen başlık (sunucu sırasında son yazan kazanır): yazmıyorsan ve
  // gönderilmemiş başlığın yoksa hemen gösterilir; yazarken gelen bekletilir, alandan
  // çıkınca (o arada yeniden yazmadıysan) uygulanır. Böylece iki taraf aynı başlıkta buluşur.
  const [seenRemote, setSeenRemote] = useState(remoteTitle);
  const [deferredTitle, setDeferredTitle] = useState<string | null>(null);
  if (remoteTitle !== seenRemote) {
    setSeenRemote(remoteTitle);
    if (remoteTitle) {
      if (!titleFocused && saver.pending?.title === undefined) setTitle(remoteTitle.title);
      else setDeferredTitle(remoteTitle.title);
    }
  }
  const { me } = useLiveConfig();
  // Canlı metin notu: gövde Yjs belgesinden (ilk eşitlemeden sonra); HTTP'ye gövde gitmez.
  const ready = Boolean(live?.provider && live.synced && me && note.kind === "text");
  const editorExtensions = live?.editorExtensions;
  const collab = useMemo(() => {
    const extensions = ready && me ? editorExtensions?.(me, "Not al…") : null;
    return extensions && live?.provider ? { key: live.provider, extensions } : null;
    // Sağlayıcı değişmedikçe aynı eklentiler (editör yeniden kurulmaz).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, live?.provider, editorExtensions]);
  const editor = useNoteEditor({
    initialHtml: note.bodyHtml,
    editable: editable && note.kind === "text" && (live ? live.canEdit : true),
    collab,
    label: "Not",
    placeholder: "Not al…",
    onChange: live ? undefined : (bodyHtml) => saver.change({ bodyHtml }),
    className: cn(
      "min-h-[120px]",
      tabletUp ? "text-[15px] leading-[1.65]" : "text-base leading-[1.6]",
    ),
  });

  const titleInput = (
    <>
      <label htmlFor={`not-baslik-${note.id}`} className="sr-only">
        Not başlığı
      </label>
      <input
        id={`not-baslik-${note.id}`}
        value={title}
        readOnly={!editable}
        onFocus={() => setTitleFocused(true)}
        onBlur={() => {
          setTitleFocused(false);
          if (deferredTitle !== null && saver.pending?.title === undefined) setTitle(deferredTitle);
          setDeferredTitle(null);
        }}
        onChange={(e) => {
          setDeferredTitle(null);
          setTitle(e.target.value);
          saver.change({ title: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (note.kind === "todo") {
              e.currentTarget
                .closest("[role=dialog]")
                ?.querySelector<HTMLInputElement>("[data-task-input]")
                ?.focus();
            } else editor?.commands.focus("start");
          }
        }}
        placeholder="Başlık"
        autoComplete="off"
        className={cn(
          "min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground",
          tabletUp ? "text-xl" : "w-full text-[22px]",
        )}
      />
    </>
  );

  const toolbar =
    note.kind === "text" && editable ? (
      <FormattingToolbar
        editor={editor}
        className={
          tabletUp
            ? "px-[22px] pb-1.5"
            : "sticky bottom-0 -mx-5 mt-auto border-t border-[color-mix(in_srgb,var(--fg)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_35%,transparent)] px-2 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur"
        }
      >
        {!tabletUp && (
          <>
            <span className="flex-1" />
            {colorButton}
            {attachButton}
          </>
        )}
      </FormattingToolbar>
    ) : null;

  const top =
    meta || lockbar || reminderChip ? (
      <div className={cn("flex flex-col gap-2", tabletUp ? "px-7 pb-2" : "pt-1 pb-2")}>
        {meta}
        {reminderChip}
        {lockbar}
      </div>
    ) : null;

  if (note.kind === "todo") {
    const editorEl = (
      <TodoEditor
        ref={todoRef}
        noteId={note.id}
        initialTasks={note.todoTasks}
        initialAssignees={note.assignees}
        live={live?.tasks}
        onActiveTaskChange={live?.setFocus}
        peers={live?.peers}
        people={people}
        editable={editable}
        taskReminders={taskReminders}
        onHelpChange={onHelpChange}
        header={
          tabletUp ? undefined : (
            <div className="px-5 pt-2 pb-1">
              {titleInput}
              {top}
            </div>
          )
        }
        footer={
          tabletUp ? (
            lockbar ? (
              <p className="m-0 px-7 pb-3 text-[13px] text-muted-foreground">
                Sana atanan görevi de işaretleyemezsin; rol için proje yöneticisine yaz.
              </p>
            ) : undefined
          ) : (
            <div className="px-5 pb-4">{mobileExtras(null)}</div>
          )
        }
      />
    );
    return tabletUp ? (
      <>
        {header(titleInput)}
        {top}
        {editorEl}
        <div className="border-t border-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
          {footer}
        </div>
      </>
    ) : (
      <>
        {header(null)}
        {editorEl}
      </>
    );
  }

  const body = <NoteEditorContent editor={editor} />;

  if (tabletUp) {
    return (
      <>
        {header(titleInput)}
        {top}
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-1.5 pb-3">
          {body}
          {attachments}
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      {header(null)}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1 pb-0">
        <div className="pt-1 pb-2">{titleInput}</div>
        {top}
        {body}
        {attachments}
        {mobileExtras(toolbar)}
      </div>
    </>
  );
}
