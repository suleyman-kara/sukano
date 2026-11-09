import { Archive, FileText, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { usePendingSectionPath } from "~/hooks/use-pending-section";

export type View = "notlar" | "arsiv" | "cop";

const VIEWS: { id: View; label: string; path: string; icon: typeof FileText }[] = [
  { id: "notlar", label: "Notlar", path: "", icon: FileText },
  { id: "arsiv", label: "Arşiv", path: "/arsiv", icon: Archive },
  { id: "cop", label: "Çöp", path: "/cop", icon: Trash2 },
];

/** Alanın görünüm kapsülü ayarı: kök yol ("" Notlarım, "/proje/:id") ve görünümler. */
export type ViewSwitchTarget = { base: string; views?: readonly View[] };

function viewOf(pathname: string, base: string): View {
  const rest = pathname.slice(base.length);
  if (rest === "/arsiv" || rest.startsWith("/arsiv/")) return "arsiv";
  if (rest === "/cop" || rest.startsWith("/cop/")) return "cop";
  return "notlar";
}

/**
 * "Notlar · Arşiv · Çöp" görünüm kapsülü (kişisel alan: `/`, `/arsiv`, `/cop`; proje:
 * `/proje/:id`, `/proje/:id/arsiv`, `/proje/:id/cop`).
 *
 * Tasarım v2: yalnızca etkin öğe etiketini gösterir, diğerleri yalnızca ikon (üzerine gelince
 * ya da odakta 500 ms sonra ipucu). Etkin öğe değişince etiket yenisinde açılır, eskisinde
 * kapanır: genişlik 180 ms ease-in-out, yeni etiket 60 ms gecikmeli 120 ms saydamlık
 * (`.vs-label`, app.css). Mobilde etiket yok. Erişilebilir ad her zaman `aria-label`.
 */
export function ViewSwitch({
  current,
  className,
  base = "",
  views,
}: { current?: View; className?: string } & Partial<ViewSwitchTarget>) {
  const { pathname } = useLocation();
  // Görünüm değişirken tıklanan sekme veri beklenmeden seçili görünür.
  const pending = usePendingSectionPath();
  const active = current ?? viewOf(pending ?? pathname, base);
  return (
    <nav
      aria-label="Görünüm"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-hover p-[3px]",
        className,
      )}
    >
      {VIEWS.filter((v) => !views || views.includes(v.id)).map(
        ({ id, label, path, icon: Icon }) => {
          const on = id === active;
          const to = base + path || "/";
          const link = (
            <Link
              to={to}
              prefetch="intent"
              aria-label={label}
              aria-current={on ? "page" : undefined}
              data-etkin={on ? "" : undefined}
              className={cn(
                "vs-item inline-flex h-(--vs-h) min-w-(--vs-h) items-center justify-center rounded-lg px-[calc((var(--vs-h)-var(--vs-icon))/2)] font-medium text-muted-foreground no-underline outline-none hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11 pointer-coarse:min-w-11",
                on &&
                  "bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,.08)] hover:text-primary",
              )}
            >
              <Icon className="size-(--vs-icon) shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="vs-label max-md:hidden" aria-hidden="true">
                <span className="overflow-hidden">
                  <span className="block pr-1 pl-1.5 text-[13px] whitespace-nowrap">{label}</span>
                </span>
              </span>
            </Link>
          );
          // Öğe etkinleşince aynı düğüm kalır (etiketin genişlik geçişi oynar); ipucu
          // yalnızca etiketi görünmeyen öğelerde.
          return (
            <Tooltip key={id} delayDuration={500}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              {!on && (
                <TooltipContent side="bottom" sideOffset={8}>
                  {label}
                </TooltipContent>
              )}
            </Tooltip>
          );
        },
      )}
    </nav>
  );
}
