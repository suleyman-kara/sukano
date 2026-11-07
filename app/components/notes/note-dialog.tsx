import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Copy,
  FolderInput,
  History,
  Keyboard,
  ListChecks,
  MoreVertical,
  Palette,
  Paperclip,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate, useRevalidator, useSubmit } from "react-router";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  COARSE_QUERY,
  editorHandlesEscape,
  TodoEditor,
  type TodoEditorHandle,
} from "~/components/tasks/todo-editor";
import type { NoteColor } from "~/db/schema";
import { formatShortDateTime } from "~/domain/notes/dates";
import { TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import type { NoteDetail } from "~/lib/notes.server";
import { ColorPalette } from "./color-palette";
import { noteBg } from "./colors";
import { useConvertNote } from "./convert-note";
import { NoteMoreMenuContent, NoteSheet, type TodoMenuHandlers } from "./note-menu";
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
};

const IB =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-expanded:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)] [&_svg]:size-5 pointer-coarse:size-11";

/**
 * Açık not. Masaüstü ve tablette ortalanmış modal, mobilde tam ekran. Başlık ve
 * gövde 800 ms sonra kendiliğinden kaydedilir; kapatırken bekleyen değişiklik
 * hemen gönderilir.
 */
export function NoteDialog({ note, closeTo, initialVersionsOpen = false }: NoteDialogProps) {
  const navigate = useNavigate();
  const actions = useNoteActions();
  const revalidator = useRevalidator();
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
  const archived = note.archivedAt !== null;
  const editable = note.trashedAt === null;

  const saver = useAutosave(note.id);
  const [openedAt] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));

  /** Bekleyen görev işlemleri bitince ızgara yeniden doğrulanır (kart güncel kalsın). */
  const flushTasks = useCallback(() => {
    const pending = todoRef.current?.flush();
    if (pending) void pending.then(() => revalidator.revalidate());
    return pending ?? Promise.resolve();
  }, [revalidator]);

  const close = useCallback(() => {
    saver.flush();
    void flushTasks();
    navigate(closeTo, { preventScrollReset: true });
  }, [saver, flushTasks, navigate, closeTo]);

  const leave = (fn: () => void) => {
    saver.flush();
    void flushTasks().then(fn);
    navigate(closeTo, { preventScrollReset: true });
  };

  const changeColor = (c: NoteColor) => {
    setColor(c);
    actions.setColor(note.id, c);
  };
  const togglePin = () => {
    setPinned((p) => !p);
    actions.setPinned(note.id, !pinned);
  };

  const edited = `Düzenlendi ${formatShortDateTime(new Date(note.updatedAt))}`;
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

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
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
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 text-fg ring-0",
          tabletUp
            ? cn(
                "top-[60px] max-h-[calc(100dvh-120px)] w-[calc(100%-2rem)] max-w-[680px] translate-y-0 rounded-2xl shadow-elevated sm:max-w-[680px]",
                // Tamamlananlar inince diyalog kısalmasın (TodoNote min-height:640px).
                isTodo && "h-[min(760px,calc(100dvh-100px))] max-h-[calc(100dvh-100px)]",
              )
            : "inset-0 top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:max-w-none",
        )}
        style={{ background: noteBg(color) }}
      >
        <DialogTitle className="sr-only">{note.title || "Başlıksız not"}</DialogTitle>
        <DialogDescription className="sr-only">
          {editable ? "Değişiklikler otomatik kaydedilir." : "Çöpteki not salt okunurdur."}
        </DialogDescription>
        <NoteBody
          key={`${note.id}:${note.kind}:${revision}`}
          note={note}
          todoRef={todoRef}
          onHelpChange={setHelpOpen}
          editable={editable}
          tabletUp={tabletUp}
          saver={saver}
          header={(titleInput) =>
            tabletUp ? (
              <div className="flex items-center gap-2.5 pt-[18px] pr-5 pb-1 pl-7">
                {titleInput}
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
                <PinButton pinned={pinned} onClick={togglePin} hidden={archived || !editable} />
                <button type="button" className={IB} disabled aria-label="Not hatırlatıcısı">
                  <Bell aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={IB}
                  aria-label="Diğer"
                  aria-haspopup="dialog"
                  onClick={() => setSheetOpen(true)}
                >
                  <MoreVertical aria-hidden="true" />
                </button>
              </div>
            )
          }
          footer={
            tabletUp ? (
              <div className="relative flex shrink-0 flex-wrap items-center gap-0.5 pt-2 pr-3.5 pb-3 pl-[18px]">
                <ColorButton color={color} onChange={changeColor} />
                <button
                  type="button"
                  className={IB}
                  disabled
                  aria-label="Not hatırlatıcısı"
                  title="Not hatırlatıcısı (yakında)"
                >
                  <Bell aria-hidden="true" />
                </button>
                {!isTodo && (
                  <button
                    type="button"
                    className={IB}
                    disabled
                    aria-label="Dosya ekle"
                    title="Dosya ekle (yakında)"
                  >
                    <Paperclip aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className={IB}
                  disabled
                  aria-label="Taşı veya kopyala…"
                  title="Taşı veya kopyala… (yakında)"
                >
                  <FolderInput aria-hidden="true" />
                </button>
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
                      dialog={{ archived, onArchive, onTrash }}
                    />
                  </DropdownMenu>
                )}
                <span className="flex-1 px-3 text-right text-xs text-muted-foreground">
                  {edited}
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
              <p className="m-0 mt-4 text-xs text-muted-foreground">{edited}</p>
              {toolbar}
            </>
          )}
          colorButton={<ColorButton color={color} onChange={changeColor} />}
        />

        {!tabletUp && (
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
            footer={<p className="m-0 px-1.5 pt-1 text-xs text-muted-foreground">{edited}</p>}
          />
        )}

        <VersionHistory
          noteId={note.id}
          noteTitle={note.title}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          onRestored={() => setRevision((r) => r + 1)}
        />
        {convert.dialog}
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
  todoRef: React.Ref<TodoEditorHandle>;
  onHelpChange: (open: boolean) => void;
  editable: boolean;
  tabletUp: boolean;
  saver: Saver;
  header: (titleInput: React.ReactNode) => React.ReactNode;
  footer: React.ReactNode;
  mobileExtras: (toolbar: React.ReactNode) => React.ReactNode;
  colorButton: React.ReactNode;
};

function NoteBody({
  note,
  todoRef,
  onHelpChange,
  editable,
  tabletUp,
  saver,
  header,
  footer,
  mobileExtras,
  colorButton,
}: NoteBodyProps) {
  const [title, setTitle] = useState(note.title);
  const editor = useNoteEditor({
    initialHtml: note.bodyHtml,
    editable: editable && note.kind === "text",
    label: "Not",
    placeholder: "Not al…",
    onChange: (bodyHtml) => saver.change({ bodyHtml }),
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
        onChange={(e) => {
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
          </>
        )}
      </FormattingToolbar>
    ) : null;

  if (note.kind === "todo") {
    const editorEl = (
      <TodoEditor
        ref={todoRef}
        noteId={note.id}
        initialTasks={note.todoTasks}
        editable={editable}
        onHelpChange={onHelpChange}
        header={tabletUp ? undefined : <div className="px-5 pt-2 pb-1">{titleInput}</div>}
        footer={tabletUp ? undefined : <div className="px-5 pb-4">{mobileExtras(null)}</div>}
      />
    );
    return tabletUp ? (
      <>
        {header(titleInput)}
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
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-1.5 pb-3">{body}</div>
        {footer}
      </>
    );
  }

  return (
    <>
      {header(null)}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1 pb-0">
        <div className="pt-1 pb-2">{titleInput}</div>
        {body}
        {mobileExtras(toolbar)}
      </div>
    </>
  );
}
