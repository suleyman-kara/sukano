import { FileText, ListChecks, Plus, X } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Composer, type ComposerDraft } from "./composer";

/**
 * Mobil (< 768 px) alt çubuk: "Not al…" alanı ve yeni not FAB'ı (MHome).
 * İkisi de tam ekran not al görünümünü açar; kapatınca kaydedilir.
 */
export function MobileNewNote({
  onSave,
  open,
  onOpenChange: setOpen,
}: {
  onSave: (draft: ComposerDraft) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-12 min-w-0 flex-1 items-center rounded-[14px] border border-line bg-surface px-4 text-left text-[15px] text-muted-foreground shadow-elevated outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Not al…
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Yeni not oluştur"
              className="group pointer-events-auto inline-flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-elevated outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus className="size-6 group-aria-expanded:hidden" aria-hidden="true" />
              <X className="hidden size-6 group-aria-expanded:block" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={12}
            aria-label="Yeni not"
            className="min-w-0 border-0 bg-transparent p-0 shadow-none ring-0"
          >
            <DropdownMenuItem
              onSelect={() => setOpen(true)}
              className="justify-end gap-2.5 bg-transparent p-1 focus:bg-transparent"
            >
              <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] font-semibold shadow-elevated">
                Metin notu
              </span>
              <span className="inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-elevated">
                <FileText className="size-5" aria-hidden="true" />
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className={cn("justify-end gap-2.5 p-1")}>
              <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] font-semibold shadow-elevated">
                Yapılacaklar notu
              </span>
              <span className="inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-elevated">
                <ListChecks className="size-5" aria-hidden="true" />
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-bg p-3 pt-[max(12px,env(safe-area-inset-top))] ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Yeni not</DialogTitle>
          <DialogDescription className="sr-only">Kapatınca kaydedilir.</DialogDescription>
          {open && (
            <Composer
              defaultOpen
              onSave={onSave}
              onClose={() => setOpen(false)}
              className="max-w-none flex-1 [&>div:nth-child(3)]:flex-1"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
