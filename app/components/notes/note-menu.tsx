import {
  Archive,
  ArchiveRestore,
  Bell,
  Copy,
  FolderInput,
  History,
  ListChecks,
  Palette,
  Pin,
  Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { DropdownMenuContent, DropdownMenuItem } from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/ui/sheet";
import type { NoteColor } from "~/db/schema";
import { ColorPalette } from "./color-palette";

const ITEM = "gap-3 px-2.5 py-2 font-medium [&_svg]:size-[18px] [&_svg]:text-muted-foreground";

export type NoteMenuHandlers = {
  onDuplicate: () => void;
  onVersions: () => void;
  /** Yapılacaklar notunda sürüm geçmişi Aşama 2'de. */
  versionsDisabled?: boolean;
};

/** Masaüstü "Diğer" (⋯) menüsü; kanonik sıra (PLAN §10), karttaki eylemler hariç. */
export function NoteMoreMenuContent({
  onDuplicate,
  onVersions,
  versionsDisabled,
  kind,
}: NoteMenuHandlers & { kind: "text" | "todo" }) {
  return (
    <DropdownMenuContent
      align="end"
      sideOffset={6}
      className="w-[260px] rounded-xl p-1.5"
      aria-label="Not işlemleri"
    >
      <DropdownMenuItem className={ITEM} onSelect={onDuplicate}>
        <Copy aria-hidden="true" />
        Kopyasını oluştur
      </DropdownMenuItem>
      <DropdownMenuItem className={ITEM} onSelect={onVersions} disabled={versionsDisabled}>
        <History aria-hidden="true" />
        Sürüm geçmişi
      </DropdownMenuItem>
      <DropdownMenuItem className={ITEM} disabled title="Yakında">
        <ListChecks aria-hidden="true" />
        {kind === "text" ? "Yapılacaklar notuna dönüştür" : "Metin notuna dönüştür"}
      </DropdownMenuItem>
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
  footer?: React.ReactNode;
};

const ROW =
  "flex min-h-12 w-full items-center gap-4 rounded-[10px] px-2.5 text-left text-[15px] font-medium outline-none hover:bg-hover focus-visible:bg-hover disabled:opacity-45 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

/** Dokunmatik "⋯": alttan açılan sayfa (MNoteMenu). Renk anında uygulanır ("Bitti"). */
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
  footer,
}: NoteSheetProps) {
  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
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
        <div className="-mb-1 flex items-center gap-2">
          <Palette className="size-[22px] text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
            Not rengi
          </span>
          <Button variant="ghost" className="text-primary" onClick={() => onOpenChange(false)}>
            Bitti
          </Button>
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
          <button type="button" role="menuitem" className={ROW} disabled>
            <ListChecks aria-hidden="true" />
            {kind === "text" ? "Yapılacaklar notuna dönüştür" : "Metin notuna dönüştür"}
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
