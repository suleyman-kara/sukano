import { X } from "lucide-react";
import { cn } from "cn";
import type { CompletionToast } from "~/domain/tasks/undo";

/**
 * Not içi toast yığını (prototip TodoNote `.toasts`): en yeni üstte, en çok iki satır;
 * ilk satırda "Ctrl+Z" ipucu. Üzerine gelince ya da odaktayken süreler durur.
 */
export function TodoToasts({
  toasts,
  onUndo,
  onClose,
  onPause,
  onResume,
  showShortcut,
  className,
}: {
  toasts: CompletionToast[];
  onUndo: (key: string) => void;
  onClose: (key: string) => void;
  onPause: () => void;
  onResume: () => void;
  /** Ctrl+Z ipucu (klavyeli cihazlarda). */
  showShortcut: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onResume();
      }}
      className={cn(
        "pointer-events-none absolute left-4 z-20 flex max-w-[440px] flex-col gap-1.5",
        className,
      )}
    >
      {toasts.map((t, i) => (
        <div
          key={t.key}
          data-todo-toast=""
          className={cn(
            "todo-toast pointer-events-auto flex items-center gap-3 rounded-xl bg-[#2a2926] py-2.5 pr-2.5 pl-4 text-[#f3f1ec] shadow-elevated dark:bg-[#eceae4] dark:text-[#1c1b19]",
            i > 0 && "opacity-[.88]",
          )}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {i === 0 && showShortcut && (
            <span
              className="shrink-0 text-[11px] font-semibold whitespace-nowrap opacity-70"
              aria-hidden="true"
            >
              Ctrl+Z
            </span>
          )}
          <button
            type="button"
            onClick={() => onUndo(t.key)}
            title={i === 0 && t.ids.length ? "Geri al (Ctrl+Z)" : "Geri al"}
            aria-label={`Geri al: ${t.text}`}
            aria-keyshortcuts={i === 0 && t.ids.length ? "Control+Z" : undefined}
            className="rounded-lg px-2.5 py-1.5 font-semibold text-[#9fd8bf] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#9fd8bf] dark:text-[#2e6b55] dark:hover:bg-black/5 dark:focus-visible:ring-[#2e6b55]"
          >
            Geri al
          </button>
          <button
            type="button"
            onClick={() => onClose(t.key)}
            aria-label="Bildirimi kapat"
            className="inline-flex size-7 items-center justify-center rounded-full opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
