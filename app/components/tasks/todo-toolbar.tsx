import {
  ArrowDown,
  ArrowUp,
  Calendar,
  IndentDecrease,
  IndentIncrease,
  TextAlignStart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";

/**
 * Ekran klavyesinin kapladığı yükseklik (visualViewport). Klavye yokken 0. Mobilde
 * araç çubuğu bu kadar yukarı kaldırılır.
 */
export function useKeyboardInset(enabled: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!enabled || !vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return enabled ? inset : 0;
}

const KBTN =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-35 aria-expanded:bg-primary-soft aria-expanded:text-primary [&_svg]:size-5";

/** Dokunuşta odak başlık alanında kalsın (klavye kapanmasın). */
const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

export type TodoToolbarProps = {
  taskTitle: string;
  canOutdent: boolean;
  canIndent: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dateOpen: boolean;
  detailOpen: boolean;
  /** Tablette yukarı/aşağı taşı da görünür (TTodo). */
  showMove: boolean;
  keyboardInset: number;
  onOutdent: () => void;
  onIndent: () => void;
  onDate: () => void;
  onDetail: () => void;
  onMove: (dir: -1 | 1) => void;
  onComplete: () => void;
  onDone: () => void;
};

/**
 * Klavye üstü araç çubuğu (dokunmatik; MTodo, TTodo): girintiyi azalt, alt görev yap,
 * tarih, ayrıntılar, (tablette) taşı, Tamamla, Bitti. Odaklı satır varken not altında
 * sabittir; mobilde ekran klavyesinin hemen üstüne kalkar.
 */
export function TodoToolbar(p: TodoToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Görev araçları"
      data-todo-esc=""
      className={cn(
        "z-30 flex shrink-0 items-center gap-0.5 border-t border-line bg-bg px-2 py-1 md:px-3 md:py-1.5",
        p.keyboardInset > 0 && "fixed inset-x-0",
      )}
      style={p.keyboardInset > 0 ? { bottom: p.keyboardInset } : undefined}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
    >
      <button
        type="button"
        className={KBTN}
        aria-label="Girintiyi azalt"
        disabled={!p.canOutdent}
        onClick={p.onOutdent}
      >
        <IndentDecrease aria-hidden="true" />
      </button>
      <button
        type="button"
        className={KBTN}
        aria-label="Alt görev yap"
        disabled={!p.canIndent}
        onClick={p.onIndent}
      >
        <IndentIncrease aria-hidden="true" />
      </button>
      <button
        type="button"
        className={KBTN}
        aria-label="Tarih"
        aria-expanded={p.dateOpen}
        onClick={p.onDate}
      >
        <Calendar aria-hidden="true" />
      </button>
      <button
        type="button"
        className={KBTN}
        aria-label="Ayrıntılar"
        aria-expanded={p.detailOpen}
        onClick={p.onDetail}
      >
        <TextAlignStart aria-hidden="true" />
      </button>
      {p.showMove && (
        <>
          <button
            type="button"
            className={KBTN}
            aria-label="Yukarı taşı"
            disabled={!p.canMoveUp}
            onClick={() => p.onMove(-1)}
          >
            <ArrowUp aria-hidden="true" />
          </button>
          <button
            type="button"
            className={KBTN}
            aria-label="Aşağı taşı"
            disabled={!p.canMoveDown}
            onClick={() => p.onMove(1)}
          >
            <ArrowDown aria-hidden="true" />
          </button>
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={p.onComplete}
        aria-label={`Görevi tamamla: ${p.taskTitle.trim() || "adsız görev"}`}
        className="h-11 shrink-0 rounded-[10px] bg-primary-soft px-4 text-sm font-semibold whitespace-nowrap text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Tamamla
      </button>
      <button
        type="button"
        onClick={p.onDone}
        aria-label="Bitti, klavyeyi kapat"
        className="h-11 shrink-0 rounded-[10px] pr-2.5 pl-3 text-[15px] font-semibold whitespace-nowrap text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Bitti
      </button>
    </div>
  );
}
