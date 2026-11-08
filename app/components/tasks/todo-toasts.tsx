import { X } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m, useIsPresent } from "motion/react";
import { cn } from "cn";
import type { CompletionToast } from "~/domain/tasks/undo";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { exitTransition, motionTransition } from "~/lib/motion";

/**
 * Not içi toast yığını (prototip TodoNote `.toasts`): en yeni üstte, en çok iki satır;
 * ilk satırda "Ctrl+Z" ipucu. Üzerine gelince ya da odaktayken süreler durur.
 * Hareket (MicroMotion 2): alttan 24 px, medium ease-out gelir; small ease-in gider.
 * Azaltılmış harekette kaymaz, anında gelir ve gider.
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
  const reduced = useReducedMotion();
  const rows = toasts.map((t, i) => (
    <ToastRow
      key={t.key}
      toast={t}
      first={i === 0}
      showShortcut={showShortcut}
      onUndo={onUndo}
      onClose={onClose}
    />
  ));
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
      {/* Azaltılmış harekette çıkış beklenmez: toast anında gider. */}
      <LazyMotion features={domAnimation}>
        {reduced ? rows : <AnimatePresence initial={false}>{rows}</AnimatePresence>}
      </LazyMotion>
    </div>
  );
}

function ToastRow({
  toast: t,
  first,
  showShortcut,
  onUndo,
  onClose,
}: {
  toast: CompletionToast;
  first: boolean;
  showShortcut: boolean;
  onUndo: (key: string) => void;
  onClose: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  // Çıkış animasyonu sürerken satır artık yığında sayılmaz (ekran okuyucu ve testler).
  const present = useIsPresent();
  return (
    <m.div
      data-todo-toast={present ? "" : undefined}
      inert={!present}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: first ? 1 : 0.88, y: 0, transition: motionTransition("medium", reduced) }}
      exit={{ opacity: 0, y: reduced ? 0 : 8, transition: exitTransition("medium", reduced) }}
      className="pointer-events-auto flex items-center gap-3 rounded-xl bg-[#2a2926] py-2.5 pr-2.5 pl-4 text-[#f3f1ec] shadow-elevated dark:bg-[#eceae4] dark:text-[#1c1b19]"
    >
      <span className="min-w-0 flex-1">{t.text}</span>
      {first && showShortcut && (
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
        title={first && t.ids.length ? "Geri al (Ctrl+Z)" : "Geri al"}
        aria-label={`Geri al: ${t.text}`}
        aria-keyshortcuts={first && t.ids.length ? "Control+Z" : undefined}
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
    </m.div>
  );
}
