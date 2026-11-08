import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import type { AttachmentView } from "~/domain/attachments/pending";
import { attachmentUrl, formatSize } from "~/domain/attachments/rules";

const IB =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white/85 outline-none hover:bg-white/12 hover:text-white focus-visible:ring-3 focus-visible:ring-white/50 [&_svg]:size-5";

/**
 * Görsel görüntüleyici: koyu zeminde tam görsel, üstte ad, boyut, İndir ve Kapat;
 * birden çok görselde ← / → ile gezinme. Esc yalnızca görüntüleyiciyi kapatır.
 */
export function AttachmentViewer({
  images,
  openId,
  onOpenChange,
}: {
  images: readonly AttachmentView[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const index = images.findIndex((x) => x.id === openId);
  const item = index >= 0 ? images[index] : undefined;
  const go = (delta: number) => {
    if (images.length < 2) return;
    const next = images[(index + delta + images.length) % images.length];
    if (next) onOpenChange(next.id);
  };
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[rgba(12,12,11,.94)] p-0 text-white ring-0 sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          else if (e.key === "ArrowLeft") go(-1);
        }}
        data-testid="gorsel-goruntuleyici"
      >
        {item && (
          <>
            <div className="flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 md:px-5">
              <div className="flex min-w-0 flex-1 flex-col">
                <DialogTitle className="truncate text-[15px] font-semibold text-white">
                  {item.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  {formatSize(item.size)}
                  {images.length > 1 ? ` · ${index + 1} / ${images.length}` : ""}
                </DialogDescription>
              </div>
              <a
                href={attachmentUrl(item.id, true)}
                download={item.name}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-white/90 no-underline outline-none hover:bg-white/12 focus-visible:ring-3 focus-visible:ring-white/50"
              >
                <Download className="size-[18px]" aria-hidden="true" />
                İndir
              </a>
              <button
                type="button"
                className={IB}
                aria-label="Kapat"
                onClick={() => onOpenChange(null)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(16px,env(safe-area-inset-bottom))] md:px-16">
              <img
                key={item.id}
                src={attachmentUrl(item.id)}
                alt={item.name}
                className="max-h-full max-w-full rounded-md object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className={`${IB} absolute top-1/2 left-2 -translate-y-1/2 bg-black/30 md:left-4`}
                    aria-label="Önceki görsel"
                    onClick={() => go(-1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${IB} absolute top-1/2 right-2 -translate-y-1/2 bg-black/30 md:right-4`}
                    aria-label="Sonraki görsel"
                    onClick={() => go(1)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
