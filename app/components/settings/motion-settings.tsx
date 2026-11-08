import { useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "cn";
import { applyMotionPreference, type MotionPreference } from "~/lib/motion";

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "Sistem" },
  { value: "reduced", label: "Açık" },
  { value: "full", label: "Kapalı" },
];

/**
 * Ayarlar › Görünüm › "Hareketi azalt" (PLAN §10, MotionSpec): Sistem / Açık / Kapalı.
 * Seçim hemen uygulanır (`<html data-motion>`), kullanıcı tercihine ve çereze yazılır.
 */
export function MotionPicker({ initial }: { initial: MotionPreference }) {
  const fetcher = useFetcher({ key: "ayarlar-motion" });
  const [value, setValue] = useState(initial);
  const choose = (next: MotionPreference) => {
    setValue(next);
    applyMotionPreference(next);
    void fetcher.submit({ intent: "motion", motion: next }, { method: "post" });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
      <span className="flex min-w-[200px] flex-1 flex-col">
        <b id="hareket-baslik" className="font-medium">
          Hareketi azalt
        </b>
        <small id="hareket-aciklama" className="text-[13px] text-muted-foreground">
          Kayma, büyüme ve arka plan hareketlerini kapatır. Sistem, cihazının ayarına uyar.
        </small>
      </span>
      <div
        role="radiogroup"
        aria-labelledby="hareket-baslik"
        aria-describedby="hareket-aciklama"
        className="grid grid-cols-3 gap-[3px] rounded-xl bg-hover p-[3px]"
      >
        {MOTION_OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex min-h-10 min-w-[76px] cursor-pointer items-center justify-center rounded-[9px] px-3 font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 md:min-h-8",
                on
                  ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                  : "text-muted-foreground hover:text-fg",
              )}
            >
              <input
                type="radio"
                name="hareket"
                value={o.value}
                checked={on}
                onChange={() => choose(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
