import {
  Archive,
  ArchiveRestore,
  Bell,
  FolderInput,
  MoreVertical,
  Palette,
  Paperclip,
  Pin,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { forwardRef, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";
import { DropdownMenu, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { AssigneeAvatars } from "~/components/tasks/person-picker";
import { checkboxLabel } from "~/components/tasks/task-row";
import { useCardTaskToggle } from "~/components/tasks/use-card-task-toggle";
import { preloadCollab } from "~/components/realtime/collab-loader";
import { ReminderChip } from "~/components/reminders/reminder-chip";
import { attachmentUrl } from "~/domain/attachments/rules";
import { trashDaysLeft, trashLeftLabel } from "~/domain/notes/dates";
import type { CardTask, NoteCardData, NoteView } from "~/domain/notes/optimistic";
import { useMediaQuery } from "~/hooks/use-media-query";
import { DEFAULT_TIME_ZONE } from "~/domain/reminders/time";
import { useShellData } from "~/lib/shell";
import { ColorPalette } from "./color-palette";
import { noteBg } from "./colors";
import { rememberCardOrigin } from "./card-to-modal";
import { useConvertNote } from "./convert-note";
import { NoteMoreMenuContent, NoteSheet } from "./note-menu";
import type { NoteActions } from "./use-note-actions";

export const COARSE_POINTER = "(pointer: coarse)";

const IB =
  "relative z-[1] inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-expanded:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)] aria-expanded:text-fg [&_svg]:size-[18px]";

export type NoteCardProps = {
  note: NoteCardData;
  view: NoteView;
  /** Kartın açtığı adres (çöpte yok). */
  href?: string;
  actions: NoteActions;
  onVersions: (id: string) => void;
  /** Kişisel not: "Taşı veya kopyala…" (verilmezse düğme devre dışı). */
  onMoveCopy?: (id: string) => void;
  /** Çöp: "Kalıcı olarak sil" onay iste. */
  onRequestDelete?: (note: NoteCardData) => void;
  /** Alt+ok ile klavyeden taşıma. */
  onKeyMove?: (delta: -1 | 1) => void;
  now?: Date;
  /** Sürükleme durumları (NoteGrid). */
  dragging?: boolean;
  dropTarget?: boolean;
  overlay?: boolean;
  /** Görüntüleyici: eylem yok, görevler madde işaretli (States2 → Görüntüleyici). */
  readOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.HTMLAttributes<HTMLElement>, "style" | "className">;

/**
 * Izgaradaki not kartı. Kartın tamamı notu açan bağlantıdır; üzerindeki
 * düğmeler bağlantının üstünde durur. Masaüstünde eylem çubuğu üzerine gelince
 * ya da odakta görünür; dokunmatikte yalnızca ⋯ her zaman görünür ve alttan
 * açılan sayfayı açar.
 */
export const NoteCard = forwardRef<HTMLElement, NoteCardProps>(function NoteCard(
  {
    note,
    view,
    href,
    actions,
    onVersions,
    onMoveCopy,
    onRequestDelete,
    onKeyMove,
    now,
    dragging,
    dropTarget,
    overlay,
    readOnly = false,
    className,
    style,
    ...rest
  },
  ref,
) {
  const titleId = useId();
  const coarse = useMediaQuery(COARSE_POINTER, false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = note.title || note.preview.split("\n")[0] || "Başlıksız not";
  const navigate = useNavigate();
  const timeZone = useShellData().timeZone ?? DEFAULT_TIME_ZONE;
  // Hatırlatıcı açık notta kurulur (kime gideceği ve proje üyeleri orada): `?hatirlatici`.
  const reminderHref = href && view !== "cop" ? `${href}?hatirlatici` : undefined;
  const versionsDisabled = false;
  const keepBar = paletteOpen || menuOpen;
  const convert = useConvertNote();
  const onConvert =
    view === "cop" || overlay
      ? undefined
      : () => convert.ask({ id: note.id, to: note.kind === "text" ? "todo" : "text" });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!onKeyMove || !e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      onKeyMove(-1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      onKeyMove(1);
    }
  };

  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      data-note-id={note.id}
      data-color={note.color}
      className={cn(
        "group/card relative mb-2.5 block break-inside-avoid rounded-xl border border-line p-3 text-fg transition-shadow duration-(--dur-micro) ease-(--ease-out) md:mb-4 md:rounded-2xl md:px-4 md:pt-4 md:pb-3",
        "hover:shadow-elevated has-[a[data-open]:focus-visible]:outline-2 has-[a[data-open]:focus-visible]:outline-offset-2 has-[a[data-open]:focus-visible]:outline-primary",
        keepBar && "shadow-elevated",
        dragging && "opacity-0",
        dropTarget &&
          "outline-2 outline-offset-2 outline-[color-mix(in_srgb,var(--muted)_60%,transparent)] outline-dashed",
        // Sürüklenen kart kalkar: 1,03 ölçek + hafif eğim + gölge (azaltılmış harekette yalnızca gölge).
        overlay &&
          "drag-lift cursor-grabbing shadow-[0_2px_4px_rgba(0,0,0,.08),0_16px_36px_rgba(0,0,0,.18)]!",
        className,
      )}
      style={{ background: noteBg(note.color), ...style }}
      {...rest}
    >
      {href && (
        <Link
          to={href}
          prefetch="intent"
          data-open=""
          aria-label={label}
          className="absolute inset-0 z-0 rounded-[inherit] outline-none"
          onKeyDown={onKeyDown}
          onClick={(e) => rememberCardOrigin(note.id, e.currentTarget.closest("article"))}
          // Not açılmadan ortak düzenleme parçası (Yjs) inmeye başlar; rota modülü de
          // `prefetch="intent"` ile iner. Açılınca editör beklemeden düzenlenebilir kurulur.
          onPointerEnter={preloadCollab}
          onFocus={preloadCollab}
          onTouchStart={preloadCollab}
          preventScrollReset
        />
      )}

      {view !== "cop" && !readOnly && (!coarse || note.pinned) && (
        <button
          type="button"
          className={cn(
            IB,
            "absolute! top-2 right-2 opacity-0 group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 focus-visible:opacity-100",
            note.pinned && "text-primary opacity-100 hover:text-primary",
            view === "arsiv" && "hidden",
          )}
          aria-label={note.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          title={note.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          aria-pressed={note.pinned}
          onClick={() => actions.setPinned(note.id, !note.pinned)}
        >
          <Pin fill={note.pinned ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      )}

      <div className="pointer-events-none relative flex flex-col gap-1.5 md:gap-2">
        {note.cover && <CardCover cover={note.cover} />}
        {note.title ? (
          <h3
            id={titleId}
            className="m-0 pr-6 text-sm font-semibold break-words md:pr-7 md:text-[15px]"
          >
            {note.title}
          </h3>
        ) : (
          <h3 id={titleId} className="sr-only">
            {label}
          </h3>
        )}
        <CardBody note={note} view={view} readOnly={readOnly} />
        {note.reminderAt != null && view !== "cop" && (
          <ReminderChip
            at={note.reminderAt}
            timeZone={timeZone}
            now={now?.getTime()}
            className="mt-0.5"
          />
        )}
        {view === "cop" && note.trashedAt && (
          <p className="m-0 text-xs text-muted-foreground">
            {trashLeftLabel(trashDaysLeft(new Date(note.trashedAt), now))}
          </p>
        )}
      </div>

      {!overlay && !readOnly && (
        <CardActions
          note={note}
          view={view}
          coarse={coarse}
          actions={actions}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          onSheet={() => setSheetOpen(true)}
          onVersions={() => onVersions(note.id)}
          onMoveCopy={onMoveCopy ? () => onMoveCopy(note.id) : undefined}
          versionsDisabled={versionsDisabled}
          onConvert={onConvert}
          onRequestDelete={onRequestDelete}
          keepBar={keepBar}
          onReminder={
            reminderHref ? () => navigate(reminderHref, { preventScrollReset: true }) : undefined
          }
        />
      )}
      {!overlay && convert.dialog}

      {coarse && view !== "cop" && !readOnly && (
        <NoteSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={label}
          kind={note.kind}
          color={note.color}
          pinned={note.pinned}
          archived={view === "arsiv"}
          onColor={(c) => actions.setColor(note.id, c)}
          onPin={() => actions.setPinned(note.id, !note.pinned)}
          onArchive={() =>
            view === "arsiv" ? actions.unarchive(note.id) : actions.archive(note.id)
          }
          onTrash={() => actions.trash(note.id)}
          onDuplicate={() => actions.duplicate(note.id)}
          onVersions={() => onVersions(note.id)}
          versionsDisabled={versionsDisabled}
          onConvert={onConvert}
          moveCopy={
            onMoveCopy
              ? { label: "Taşı veya kopyala…", onSelect: () => onMoveCopy(note.id) }
              : undefined
          }
          onReminder={reminderHref ? () => navigate(reminderHref) : undefined}
        />
      )}
    </article>
  );
});

function CardBody({
  note,
  view,
  readOnly,
}: {
  note: NoteCardData;
  view: NoteView;
  readOnly: boolean;
}) {
  const toggle = useCardTaskToggle();
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  if (note.kind === "todo") {
    const tasks = note.tasks.filter((t) => !t.id || !gone.has(t.id));
    if (tasks.length === 0) {
      return note.moreTasks > 0 && view === "arsiv" ? (
        <p className="m-0 text-[13px] text-muted-foreground md:text-sm">Tüm görevler tamamlandı</p>
      ) : null;
    }
    const tickable = view !== "cop" && !readOnly;
    const tick = (t: CardTask) => {
      const id = t.id!;
      toggle(note.id, t, {
        hide: () => setGone((s) => new Set(s).add(id)),
        show: () =>
          setGone((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          }),
      });
    };
    return (
      <>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] md:gap-1.5 md:text-sm">
          {tasks.map((t, i) => (
            <li key={t.id ?? `i${i}`} className="flex items-start gap-2 md:gap-2.5">
              {tickable && t.id ? (
                <input
                  type="checkbox"
                  className="card-cb pointer-events-auto relative z-[1]"
                  checked={false}
                  onChange={() => tick(t)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={checkboxLabel(t.title)}
                />
              ) : readOnly ? (
                <span
                  className="mx-1 mt-[7px] size-1.5 shrink-0 rounded-full border border-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="mt-0.5 size-4 shrink-0 rounded-[5px] border-[1.5px] border-muted-foreground opacity-80"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 break-words">{t.title}</span>
              {t.assignees && (
                <AssigneeAvatars people={t.assignees} size={18} max={2} className="mt-px" />
              )}
            </li>
          ))}
        </ul>
        {note.moreTasks > 0 && (
          <p className="m-0 text-xs text-muted-foreground md:text-[13px]">
            +{note.moreTasks} görev daha
          </p>
        )}
      </>
    );
  }
  const files = !note.cover && note.attachmentCount ? note.attachmentCount : 0;
  if (!note.preview && !files) return null;
  return (
    <>
      {note.preview && (
        <p className="m-0 line-clamp-4 text-[13px] break-words whitespace-pre-line md:line-clamp-[12] md:text-sm">
          {note.preview}
        </p>
      )}
      {files > 0 && (
        <p
          className="m-0 flex items-center gap-1 text-xs text-muted-foreground"
          data-ek-sayisi={files}
        >
          <Paperclip className="size-3.5" aria-hidden="true" />
          {files} ek
        </p>
      )}
    </>
  );
}

/** Metin notunun ilk görsel eki kartın üstünde tam genişlik (CardStates "görsel ekli"). */
function CardCover({ cover }: { cover: { id: string; name: string } }) {
  return (
    <div className="-mx-3 -mt-3 mb-1 h-[132px] overflow-hidden rounded-t-[11px] bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] md:-mx-4 md:-mt-4 md:mb-1.5 md:rounded-t-[15px]">
      <img
        src={attachmentUrl(cover.id)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="size-full object-cover"
        data-kapak={cover.id}
      />
    </div>
  );
}

type CardActionsProps = {
  note: NoteCardData;
  view: NoteView;
  coarse: boolean;
  actions: NoteActions;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (o: boolean) => void;
  onSheet: () => void;
  onVersions: () => void;
  onMoveCopy?: () => void;
  versionsDisabled: boolean;
  onConvert?: () => void;
  onRequestDelete?: (note: NoteCardData) => void;
  keepBar: boolean;
  onReminder?: () => void;
};

const BAR =
  "relative z-[1] -mx-2 mt-1.5 -mb-1.5 flex gap-0.5 opacity-0 transition-opacity duration-(--dur-micro) ease-(--ease-out) group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 focus-within:opacity-100";

function CardActions({
  note,
  view,
  coarse,
  actions,
  paletteOpen,
  setPaletteOpen,
  menuOpen,
  setMenuOpen,
  onSheet,
  onVersions,
  onMoveCopy,
  versionsDisabled,
  onConvert,
  onRequestDelete,
  keepBar,
  onReminder,
}: CardActionsProps) {
  if (view === "cop") {
    return (
      <div className={cn(BAR, coarse && "opacity-100")}>
        <button
          type="button"
          className={IB}
          aria-label="Geri yükle"
          title="Geri yükle"
          onClick={() => actions.restore(note.id)}
        >
          <RotateCcw aria-hidden="true" />
        </button>
        <button
          type="button"
          className={IB}
          aria-label="Kalıcı olarak sil"
          title="Kalıcı olarak sil"
          onClick={() => onRequestDelete?.(note)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (coarse) {
    return (
      <div className="relative z-[1] -mr-1.5 -mb-1.5 flex justify-end">
        <button
          type="button"
          className={cn(IB, "size-9")}
          aria-label={`${note.title || "Not"}: işlemler`}
          aria-haspopup="dialog"
          onClick={onSheet}
        >
          <MoreVertical aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(BAR, keepBar && "opacity-100")}>
      <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={IB} aria-label="Renk" title="Renk">
            <Palette aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-xl p-2.5">
          <ColorPalette value={note.color} onChange={(c) => actions.setColor(note.id, c)} />
        </PopoverContent>
      </Popover>
      {view === "notlar" && (
        <>
          <button
            type="button"
            className={IB}
            disabled={!onReminder}
            aria-label="Not hatırlatıcısı"
            title="Not hatırlatıcısı"
            aria-haspopup="dialog"
            onClick={onReminder}
          >
            <Bell aria-hidden="true" />
          </button>
          <button
            type="button"
            className={IB}
            disabled={!onMoveCopy}
            aria-label="Taşı veya kopyala…"
            title="Taşı veya kopyala…"
            aria-haspopup="dialog"
            onClick={onMoveCopy}
          >
            <FolderInput aria-hidden="true" />
          </button>
          <button
            type="button"
            className={IB}
            aria-label="Arşivle"
            title="Arşivle"
            onClick={() => actions.archive(note.id)}
          >
            <Archive aria-hidden="true" />
          </button>
        </>
      )}
      {view === "arsiv" && (
        <button
          type="button"
          className={IB}
          aria-label="Arşivden çıkar"
          title="Arşivden çıkar"
          onClick={() => actions.unarchive(note.id)}
        >
          <ArchiveRestore aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={IB}
        aria-label="Çöpe at"
        title="Çöpe at"
        onClick={() => actions.trash(note.id)}
      >
        <Trash2 aria-hidden="true" />
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={IB} aria-label="Diğer" title="Diğer">
            <MoreVertical aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <NoteMoreMenuContent
          kind={note.kind}
          onDuplicate={() => actions.duplicate(note.id)}
          onVersions={onVersions}
          versionsDisabled={versionsDisabled}
          onConvert={onConvert}
        />
      </DropdownMenu>
      {view === "arsiv" && (
        <span className="ml-auto self-center pr-2 text-xs text-muted-foreground">Arşivde</span>
      )}
    </div>
  );
}
