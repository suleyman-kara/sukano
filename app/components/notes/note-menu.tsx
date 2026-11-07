import {
  Archive,
  ArchiveRestore,
  Bell,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FileText,
  FolderInput,
  History,
  ListChecks,
  ListX,
  Palette,
  Pin,
  Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/ui/sheet";
import type { NoteColor } from "~/db/schema";
import { ColorPalette } from "./color-palette";

const ITEM = "gap-3 px-2.5 py-2 font-medium [&_svg]:size-[18px] [&_svg]:text-muted-foreground";

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
};

export const convertLabel = (kind: "text" | "todo") =>
  kind === "text" ? "Yapılacaklar notuna dönüştür" : "Metin notuna dönüştür";

/**
 * Masaüstü "Diğer" (⋯) menüsü; kanonik sıra (PLAN §10). Kartta, kart çubuğunda duran
 * eylemler tekrarlanmaz. Açık yapılacaklar notunda en üstte Tümünü aç / Tümünü kapat /
 * Tamamlananları sil, sonda Sürüm geçmişi, Arşivle ve Çöpe at (`dialog`) yer alır.
 */
export function NoteMoreMenuContent({
  onDuplicate,
  onVersions,
  versionsDisabled,
  onConvert,
  kind,
  todo,
  dialog,
}: NoteMenuHandlers & {
  kind: "text" | "todo";
  todo?: TodoMenuHandlers;
  dialog?: { archived: boolean; onArchive: () => void; onTrash: () => void };
}) {
  return (
    <DropdownMenuContent
      align="end"
      sideOffset={6}
      className="w-[260px] rounded-xl p-1.5"
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
      <DropdownMenuItem className={ITEM} onSelect={onDuplicate}>
        <Copy aria-hidden="true" />
        Kopyasını oluştur
      </DropdownMenuItem>
      {dialog ? (
        <DropdownMenuItem className={ITEM} onSelect={onConvert} disabled={!onConvert}>
          {kind === "text" ? <ListChecks aria-hidden="true" /> : <FileText aria-hidden="true" />}
          {convertLabel(kind)}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem className={ITEM} onSelect={onVersions} disabled={versionsDisabled}>
        <History aria-hidden="true" />
        Sürüm geçmişi
      </DropdownMenuItem>
      {!dialog && (
        <DropdownMenuItem className={ITEM} onSelect={onConvert} disabled={!onConvert}>
          {kind === "text" ? <ListChecks aria-hidden="true" /> : <FileText aria-hidden="true" />}
          {convertLabel(kind)}
        </DropdownMenuItem>
      )}
      {dialog && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={ITEM} onSelect={dialog.onArchive}>
            {dialog.archived ? (
              <ArchiveRestore aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {dialog.archived ? "Arşivden çıkar" : "Arşivle"}
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={dialog.onTrash}>
            <Trash2 aria-hidden="true" />
            Çöpe at
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

type NoteSheetProps = NoteMenuHandlers & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  kind: "text" | "todo";
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  onColor: (color: NoteColor) => void;
  onPin: () => void;
  onArchive: () => void;
  onTrash: () => void;
  /** Açık yapılacaklar notunda en üstteki komutlar (MTodoMenu). */
  todo?: TodoMenuHandlers;
  footer?: React.ReactNode;
};

const ROW =
  "flex min-h-12 w-full items-center gap-4 rounded-[10px] px-2.5 text-left text-[15px] font-medium outline-none hover:bg-hover focus-visible:bg-hover disabled:opacity-45 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

/** Dokunmatik "⋯": alttan açılan sayfa (MNoteMenu, MTodoMenu). Renk anında uygulanır ("Bitti"). */
export function NoteSheet({
  open,
  onOpenChange,
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
  todo,
  footer,
}: NoteSheetProps) {
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
        {todo && (
          <>
            <div className="-my-1 flex items-center gap-2">
              <span className="min-w-0 truncate rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
                {title || "Başlıksız not"}
              </span>
              <span className="flex-1" />
              {done}
            </div>
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
        <div
          role="menu"
          aria-label="Not işlemleri"
          className="flex flex-col border-t border-line pt-1.5"
        >
          {!archived && (
            <button type="button" role="menuitem" className={ROW} onClick={act(onPin)}>
              <Pin aria-hidden="true" />
              {pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
            </button>
          )}
          <button type="button" role="menuitem" className={ROW} disabled>
            <Bell aria-hidden="true" />
            Not hatırlatıcısı
          </button>
          <button type="button" role="menuitem" className={ROW} disabled>
            <FolderInput aria-hidden="true" />
            Taşı veya kopyala…
          </button>
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
          <div className="my-1 h-px bg-line" role="separator" />
          <button type="button" role="menuitem" className={ROW} onClick={act(onArchive)}>
            {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {archived ? "Arşivden çıkar" : "Arşivle"}
          </button>
          <button type="button" role="menuitem" className={ROW} onClick={act(onTrash)}>
            <Trash2 aria-hidden="true" />
            Çöpe at
          </button>
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
