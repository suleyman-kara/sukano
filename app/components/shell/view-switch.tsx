import { Archive, FileText, Trash2 } from "lucide-react";
import { cn } from "cn";

type View = "notlar" | "arsiv" | "cop";

const VIEWS: { id: View; label: string; icon: typeof FileText }[] = [
  { id: "notlar", label: "Notlar", icon: FileText },
  { id: "arsiv", label: "Arşiv", icon: Archive },
  { id: "cop", label: "Çöp", icon: Trash2 },
];

/**
 * "Notlar · Arşiv · Çöp" görünüm kapsülü (YER TUTUCU). Arşiv ve Çöp
 * Aşama 1'de bağlanacak. Etiketler: masaüstünde hepsi, tablette yalnızca
 * seçili, mobilde hiçbiri.
 */
export function ViewSwitch({
  current = "notlar",
  className,
}: {
  current?: View;
  className?: string;
}) {
  return (
    <nav
      aria-label="Görünüm"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-hover p-[3px]",
        className,
      )}
    >
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const on = id === current;
        return (
          <button
            key={id}
            type="button"
            title={on ? label : `${label} (yakında)`}
            aria-label={label}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted-foreground transition-colors hover:text-fg",
              on && "bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,.08)] hover:text-primary",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className={cn("text-[13px]", on ? "hidden md:inline" : "hidden lg:inline")}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
