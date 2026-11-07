import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "cn";
import type { ProjectColor } from "~/db/schema";
import { PROJECT_COLOR_OPTIONS, projectColorVar } from "./project-meta";

/** Proje rengi seçici: 7 renk, radyo grubu (ok tuşlarıyla gezilir). */
export function ProjectColorPicker({
  value,
  onChange,
  name = "color",
  label = "Renk",
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  name?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[13px] font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1 md:gap-1.5">
        {PROJECT_COLOR_OPTIONS.map((c) => {
          const checked = c.value === value;
          return (
            <label
              key={c.value}
              title={c.label}
              className={cn(
                "relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full max-[400px]:size-10 md:size-9",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              )}
            >
              <input
                type="radio"
                name={name}
                id={`${id}-${c.value}`}
                value={c.value}
                checked={checked}
                onChange={() => onChange(c.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-full text-white max-[400px]:size-8 md:size-7",
                  checked && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                )}
                style={{ background: projectColorVar(c.value) }}
                aria-hidden="true"
              >
                {checked && <Check className="size-4" strokeWidth={2.5} />}
              </span>
              <span className="sr-only">{c.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
