import { Check } from "lucide-react";
import { cn } from "cn";
import type { NoteColor } from "~/db/schema";
import { NOTE_COLOR_LABELS, NOTE_COLORS, noteBg } from "./colors";

type ColorPaletteProps = {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  /** "row": masaüstü açılır palet (tek satır); "grid": mobil sayfa (5 × 2). */
  layout?: "row" | "grid";
  className?: string;
};

/** 10 not rengi. Seçili renk tik ve vurgu kenarlığıyla belirtilir. */
export function ColorPalette({ value, onChange, layout = "row", className }: ColorPaletteProps) {
  return (
    <div
      role="group"
      aria-label="Not rengi"
      className={cn(
        layout === "row"
          ? "flex gap-1.5"
          : "grid grid-cols-[repeat(5,44px)] justify-between gap-y-1 px-1.5 py-0.5",
        className,
      )}
    >
      {NOTE_COLORS.map((color) => {
        const on = color === value;
        const label = NOTE_COLOR_LABELS[color];
        return (
          <button
            key={color}
            type="button"
            aria-label={on ? `${label}, seçili` : label}
            aria-pressed={on}
            title={label}
            onClick={() => onChange(color)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              layout === "row" ? "size-[30px]" : "size-11",
              on ? "border-primary" : "border-transparent hover:border-muted-foreground",
            )}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--fg)_14%,transparent)]",
                layout === "row" ? "size-[26px]" : "size-9",
              )}
              style={{ background: noteBg(color) }}
            >
              {on && <Check className="size-4 text-primary" strokeWidth={2.5} aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
