import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

const SECTION =
  "pt-3.5 pb-1 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase";

function Keys({ keys }: { keys: string[][] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[3px] text-[11px] whitespace-nowrap text-muted-foreground">
      {keys.map((combo, i) => (
        <span key={i} className="inline-flex items-center gap-[3px]">
          {combo.map((k, j) => (
            <span key={k} className="inline-flex items-center gap-[3px]">
              {j > 0 && "+"}
              <kbd className="inline-block min-w-[18px] rounded bg-line px-[5px] text-center font-sans text-[11px] leading-[18px] font-semibold text-fg">
                {k}
              </kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function Row({
  label,
  keys,
  children,
}: {
  label: string;
  keys?: string[][];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-[13px]">
      <span className="min-w-0">{label}</span>
      {keys ? <Keys keys={keys} /> : children}
    </div>
  );
}

/**
 * Klavye kısayolları kartı (PLAN §10, prototip TodoNote): Ctrl+/ ya da alt çubuktaki
 * klavye simgesi açar; Esc ya da yeniden Ctrl+/ kapatır. Kapanınca odak açan yere döner.
 */
export function ShortcutCard({
  open,
  onOpenChange,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kapanınca odak nereye dönecek (varsayılan: açan düğme). */
  onClosed?: () => boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-dim data-open:animate-in data-open:fade-in-0 reduced-motion:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (onClosed?.()) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "/") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[560px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-surface pt-1.5 pr-2 pb-3.5 pl-[22px] text-fg shadow-elevated outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 reduced-motion:animate-none"
        >
          <div className="flex items-center justify-between gap-3 pt-1.5">
            <DialogPrimitive.Title className="m-0 text-base font-semibold">
              Klavye kısayolları
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Kısayolları kapat"
              title="Kapat (Esc)"
              className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="grid grid-cols-1 gap-x-7 gap-y-1 pr-3.5 sm:grid-cols-2">
            <div>
              <h3 className={SECTION}>Gezinme</h3>
              <Row label="Satırlar arasında" keys={[["↑"], ["↓"]]} />
              <Row label="Alt görevleri aç" keys={[["→"]]} />
              <Row label="Alt görevleri kapat" keys={[["←"]]} />
              <Row label="Seçiciyi, ayrıntıyı kapat" keys={[["Esc"]]} />
              <Row label="Listeden çık" keys={[["Esc"]]} />
              <Row label="Notu kapat (liste dışında)" keys={[["Esc"]]} />
              <h3 className={SECTION}>Tarih ve atama</h3>
              <Row label="Tarih" keys={[["Ctrl", "D"]]} />
              <Row label="Kişiye ata" keys={[["Ctrl", "Shift", "A"]]} />
              <Row label="Seçicide gezin" keys={[["Tab"]]} />
              <h3 className={SECTION}>Satırdaki işaretler</h3>
              <Row label="3 alt görevden 1'i tamamlandı">
                <span className="rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
                  1/3
                </span>
              </Row>
            </div>
            <div>
              <h3 className={SECTION}>Düzenleme</h3>
              <Row label="Yeni görev" keys={[["Enter"]]} />
              <Row label="Ayrıntılar" keys={[["Shift", "Enter"]]} />
              <Row label="Alt görev" keys={[["Tab"]]} />
              <Row label="Üst seviye (boş alt görevde Enter da)" keys={[["Shift", "Tab"]]} />
              <Row label="Boş satırı sil" keys={[["Backspace"]]} />
              <Row label="Taşı" keys={[["Alt", "↑"], ["↓"]]} />
              <Row label="Tamamla" keys={[["Ctrl", "Enter"]]} />
              <Row label="Son tamamlamayı geri al" keys={[["Ctrl", "Z"]]} />
            </div>
          </div>
          <div className="mt-3 mr-3.5 flex flex-wrap items-center gap-1 border-t border-line pt-2.5 text-[13px] text-muted-foreground">
            <Keys keys={[["Ctrl", "/"]]} /> bu kartı açar · görev başlığında hiçbir karakter kısayol
            değildir
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
