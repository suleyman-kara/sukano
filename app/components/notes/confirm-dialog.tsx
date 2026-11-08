import { TriangleAlert, X } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { cn } from "cn";
import { Button } from "~/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** Başlığın altındaki bağlam satırı (ör. not adı ve kalan gün). */
  chip?: React.ReactNode;
  chipStyle?: React.CSSProperties;
  /** Açıklamanın altındaki bilgi kutusu. */
  note?: React.ReactNode;
  tone?: "danger" | "primary";
  /** Onay engelli (ör. eki olan not yapılacaklara dönüştürülemez). */
  confirmDisabled?: boolean;
  /** Başlık simgesi (varsayılan uyarı üçgeni). */
  icon?: React.ReactNode;
  /** "Vazgeç" yerine ikincil eylem (ör. "Proje ayarlarına git"). */
  cancel?: React.ReactNode;
  /** Açıklamanın altında ek içerik (ör. onay için e-posta alanı). */
  children?: React.ReactNode;
};

/**
 * Onay diyaloğu (Dialogs2): kalıcı silme, çöpü boşalt, sürüm geri yükleme.
 * Mobilde alttan açılan sayfa görünümünde (MConfirm).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  chip,
  chipStyle,
  note,
  tone = "danger",
  confirmDisabled = false,
  icon,
  cancel,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-dim data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={cn(
            "fixed z-50 flex flex-col gap-4 border border-line bg-surface p-6 text-fg shadow-elevated outline-none",
            "inset-x-0 bottom-0 rounded-t-[20px] pb-[max(24px,env(safe-area-inset-bottom))]",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
              )}
              aria-hidden="true"
            >
              {icon ?? <TriangleAlert className="size-5" />}
            </span>
            <AlertDialog.Title className="m-0 flex-1 pt-1.5 text-lg font-semibold">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="ib inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-fg"
              >
                <X aria-hidden="true" />
              </button>
            </AlertDialog.Cancel>
          </div>
          {chip && (
            <div
              className="flex items-center gap-2.5 rounded-[10px] border border-line px-3 py-2.5"
              style={chipStyle}
            >
              {chip}
            </div>
          )}
          <AlertDialog.Description className="m-0 text-muted-foreground">
            {description}
          </AlertDialog.Description>
          {note && (
            <div className="flex gap-2.5 rounded-[10px] bg-hover px-3 py-2.5 text-[13px] text-muted-foreground">
              {note}
            </div>
          )}
          {children}
          <div className="flex justify-end gap-2 pt-1 max-sm:[&>*]:flex-1">
            {cancel ?? (
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Vazgeç</Button>
              </AlertDialog.Cancel>
            )}
            <AlertDialog.Action asChild>
              <Button
                onClick={onConfirm}
                disabled={confirmDisabled}
                className={cn(
                  tone === "danger" &&
                    "bg-danger text-white hover:bg-danger/90 dark:text-[#141413]",
                )}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
