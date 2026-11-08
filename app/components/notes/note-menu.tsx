import {
  Archive,
  ArchiveRestore,
  Bell,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FileText,
  FolderInput,
  FolderOutput,
  History,
  Keyboard,
  ListChecks,
  ListX,
  Palette,
  Pin,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/ui/sheet";
import type { NoteColor } from "~/db/schema";
import { ColorPalette } from "./color-palette";

const ITEM =
  "gap-3 px-2.5 py-2 font-medium pointer-coarse:min-h-11 [&_svg]:size-(--menu-icon) [&_svg]:text-muted-foreground";

/** Yapılacaklar notunun en üstteki komutları (PLAN §10 kanonik sıra). */
export type TodoMenuHandlers = {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onClearCompleted: () => void;
};

export type NoteMenuHandlers = {
  onDuplicate: () => void;
  onVersions: () => void;
  versionsDisabled?: boolean;
  /** Metin ↔ yapılacaklar (onaylı). */
  onConvert?: () => void;
  /**
   * "Taşı veya kopyala…" (kişisel not) ya da "Kopyala…" (proje notu). Verilmezse
   * kişisel not menüsünde devre dışı görünür; `null` ise hiç görünmez.
   */
  moveCopy?: MoveCopyEntry | null;
};

/** ⋯ menüsünün sonu: ince ayraçtan sonra kırmızı "Sil" (onaysız çöpe atar, Geri al toast'ı). */
export function TrashMenuItem({ onTrash }: { onTrash: () => void }) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" className={ITEM} onSelect={onTrash}>
        <Trash2 aria-hidden="true" />
        Sil
      </DropdownMenuItem>
    </>
  );
}

export type MoveCopyEntry = { label: "Taşı veya kopyala…" | "Kopyala…"; onSelect: () => void };

function MoveCopyIcon({ label }: { label: MoveCopyEntry["label"] }) {
  return label === "Kopyala…" ? (
    <FolderOutput aria-hidden="true" />
  ) : (
    <FolderInput aria-hidden="true" />
  );
}

export const convertLabel = (kind: "text" | "todo") =>
  kind === "text" ? "Yapılacaklar notuna dönüştür" : "Metin notuna dönüştür";

/**
 * Masaüstü "Diğer" (⋯) menüsü; kanonik sıra (PLAN §10, tasarım v2): [yapılacaklar
 * komutları] · Taşı veya kopyala… / Kopyala… · Kopyasını oluştur · Sürüm geçmişi ·
 * Dönüştür · Klavye kısayolları (yalnızca açık not) · ─ · Sil (kırmızı, en sonda).
 */
export function NoteMoreMenuContent({
  onDuplicate,
  onVersions,
  versionsDisabled,
  onConvert,
  moveCopy,
  kind,
  todo,
  onShortcuts,
  onTrash,
  side,
  align = "end",
}: NoteMenuHandlers & {
  kind: "text" | "todo";
  todo?: TodoMenuHandlers;
  /** "Klavye kısayolları (Ctrl+/)" (açık not, klavyeli cihaz). */
  onShortcuts?: () => void;
  /** Verilirse menünün sonunda ayraçtan sonra kırmızı "Sil". */
  onTrash?: () => void;
  /** Açılma yönü: açık notun alt çubuğunda düğmenin sol üstünden yukarı (v2.1). */
  side?: "top" | "bottom";
  align?: "start" | "end";
}) {
  return (
    <DropdownMenuContent
      align={align}
      side={side}
      sideOffset={6}
      className="w-(--menu-w) rounded-xl p-1.5"
      aria-label="Not işlemleri"
    >
      {todo && (
        <>
          <DropdownMenuItem className={ITEM} onSelect={todo.onExpandAll}>
            <ChevronsUpDown aria-hidden="true" />
            Tümünü aç
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={todo.onCollapseAll}>
            <ChevronsDownUp aria-hidden="true" />
            Tümünü kapat
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={todo.onClearCompleted}>
            <ListX aria-hidden="true" />
            Tamamlananları sil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {moveCopy && (
        <DropdownMenuItem className={ITEM} onSelect={moveCopy.onSelect}>
          <MoveCopyIcon label={moveCopy.label} />
          {moveCopy.label}
        </DropdownMenuItem>
      )}
      {onDuplicate && (
        <DropdownMenuItem className={ITEM} onSelect={onDuplicate}>
          <Copy aria-hidden="true" />
          Kopyasını oluştur
        </DropdownMenuItem>
      )}
      {/* Kanonik sıra (PLAN §10): … Kopyasını oluştur · Sürüm geçmişi · Dönüştür. */}
      <DropdownMenuItem className={ITEM} onSelect={onVersions} disabled={versionsDisabled}>
        <History aria-hidden="true" />
        Sürüm geçmişi
      </DropdownMenuItem>
      <DropdownMenuItem className={ITEM} onSelect={onConvert} disabled={!onConvert}>
        {kind === "text" ? <ListChecks aria-hidden="true" /> : <FileText aria-hidden="true" />}
        {convertLabel(kind)}
      </DropdownMenuItem>
      {onShortcuts && (
        <DropdownMenuItem className={ITEM} onSelect={onShortcuts}>
          <Keyboard aria-hidden="true" />
          Klavye kısayolları
          <kbd className="ml-auto font-sans text-xs text-muted-foreground">Ctrl+/</kbd>
        </DropdownMenuItem>
      )}
      {onTrash && <TrashMenuItem onTrash={onTrash} />}
    </DropdownMenuContent>
  );
}

type NoteSheetProps = NoteMenuHandlers & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "card": kartın ⋯ sayfası (renk, sabitle, hatırlatıcı, … Arşivle, Sil). "open": açık
   * notun ⋯ sayfası (MNoteMenu, MTodoMenu): Sabitle, Arşivle ve Hatırlatıcı üst/alt
   * çubukta olduğundan sayfada yok; renk yalnızca `onColor` verilirse.
   */
  variant?: "card" | "open";
  title: string;
  kind: "text" | "todo";
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  onColor?: (color: NoteColor) => void;
  onPin: () => void;
  onArchive: () => void;
  onTrash: () => void;
  /** Açık yapılacaklar notunda en üstteki komutlar (MTodoMenu). */
  todo?: TodoMenuHandlers;
  footer?: React.ReactNode;
  /** "Not hatırlatıcısı" (yoksa devre dışı). */
  onReminder?: () => void;
};

const ROW_BASE =
  "flex min-h-12 w-full items-center gap-4 rounded-[10px] px-2.5 text-left text-[15px] font-medium outline-none disabled:opacity-45 [&>svg]:size-5 [&>svg]:shrink-0";
const ROW = `${ROW_BASE} hover:bg-hover focus-visible:bg-hover [&>svg]:text-muted-foreground`;
/** Yıkıcı satır ("Sil"): kırmızı metin ve ikon. */
const DANGER_ROW = `${ROW_BASE} text-danger hover:bg-danger-soft focus-visible:bg-danger-soft [&>svg]:text-danger`;

/** Dokunmatik "⋯": alttan açılan sayfa (MNoteMenu, MTodoMenu). Renk anında uygulanır ("Bitti"). */
export function NoteSheet({
  open,
  onOpenChange,
  variant = "card",
  title,
  kind,
  color,
  pinned,
  archived,
  onColor,
  onPin,
  onArchive,
  onTrash,
  onDuplicate,
  onVersions,
  versionsDisabled,
  onConvert,
  moveCopy,
  todo,
  footer,
  onReminder,
}: NoteSheetProps) {
  const card = variant === "card";
  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  const done = (
    <Button variant="ghost" className="text-primary" onClick={() => onOpenChange(false)}>
      Bitti
    </Button>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-2 overflow-y-auto rounded-t-[20px] bg-surface px-4 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Kapat"
          className="mx-auto flex h-6 w-16 items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        </button>
        <SheetTitle className="sr-only">
          {title ? `${title}: not işlemleri` : "Not işlemleri"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Renk, sabitleme, kopya, sürümler, arşiv ve çöp
        </SheetDescription>
        {(todo || !onColor) && (
          <div className="-my-1 flex items-center gap-2">
            <span className="min-w-0 truncate rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
              {title || "Başlıksız not"}
            </span>
            <span className="flex-1" />
            {done}
          </div>
        )}
        {todo && (
          <>
            <div role="menu" aria-label="Görev işlemleri" className="flex flex-col">
              <button type="button" role="menuitem" className={ROW} onClick={act(todo.onExpandAll)}>
                <ChevronsUpDown aria-hidden="true" />
                Tümünü aç
              </button>
              <button
                type="button"
                role="menuitem"
                className={ROW}
                onClick={act(todo.onCollapseAll)}
              >
                <ChevronsDownUp aria-hidden="true" />
                Tümünü kapat
              </button>
              <button
                type="button"
                role="menuitem"
                className={ROW}
                onClick={act(todo.onClearCompleted)}
              >
                <ListX aria-hidden="true" />
                Tamamlananları sil
              </button>
            </div>
          </>
        )}
        {onColor && (
          <>
            <div
              className={
                todo
                  ? "flex items-center gap-2 border-t border-line pt-2"
                  : "-mb-1 flex items-center gap-2"
              }
            >
              <Palette className="size-[22px] text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
                Not rengi
              </span>
              {!todo && done}
            </div>
            <ColorPalette value={color} onChange={onColor} layout="grid" />
          </>
        )}
        <div
          role="menu"
          aria-label="Not işlemleri"
          className={cn("flex flex-col", (todo || onColor) && "border-t border-line pt-1.5")}
        >
          {card && !archived && (
            <button type="button" role="menuitem" className={ROW} onClick={act(onPin)}>
              <Pin aria-hidden="true" />
              {pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
            </button>
          )}
          {card && (
            <button
              type="button"
              role="menuitem"
              className={ROW}
              disabled={!onReminder}
              onClick={onReminder ? act(onReminder) : undefined}
            >
              <Bell aria-hidden="true" />
              Not hatırlatıcısı
            </button>
          )}
          {moveCopy ? (
            <button type="button" role="menuitem" className={ROW} onClick={act(moveCopy.onSelect)}>
              <MoveCopyIcon label={moveCopy.label} />
              {moveCopy.label}
            </button>
          ) : (
            moveCopy === undefined && (
              <button type="button" role="menuitem" className={ROW} disabled>
                <FolderInput aria-hidden="true" />
                Taşı veya kopyala…
              </button>
            )
          )}
          <button type="button" role="menuitem" className={ROW} onClick={act(onDuplicate)}>
            <Copy aria-hidden="true" />
            Kopyasını oluştur
          </button>
          <button
            type="button"
            role="menuitem"
            className={ROW}
            onClick={act(onVersions)}
            disabled={versionsDisabled}
          >
            <History aria-hidden="true" />
            Sürüm geçmişi
          </button>
          <button
            type="button"
            role="menuitem"
            className={ROW}
            disabled={!onConvert}
            onClick={onConvert ? act(onConvert) : undefined}
          >
            {kind === "text" ? <ListChecks aria-hidden="true" /> : <FileText aria-hidden="true" />}
            {convertLabel(kind)}
          </button>
          {card && (
            <>
              <div className="my-1 h-px bg-line" role="separator" />
              <button type="button" role="menuitem" className={ROW} onClick={act(onArchive)}>
                {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                {archived ? "Arşivden çıkar" : "Arşivle"}
              </button>
            </>
          )}
          <div className="my-1 h-px bg-line" role="separator" />
          <button type="button" role="menuitem" className={DANGER_ROW} onClick={act(onTrash)}>
            <Trash2 aria-hidden="true" />
            Sil
          </button>
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
