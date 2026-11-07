import { Archive, FileText, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "cn";

type View = "notlar" | "arsiv" | "cop";

const VIEWS: { id: View; label: string; to: string; icon: typeof FileText }[] = [
  { id: "notlar", label: "Notlar", to: "/", icon: FileText },
  { id: "arsiv", label: "Arşiv", to: "/arsiv", icon: Archive },
  { id: "cop", label: "Çöp", to: "/cop", icon: Trash2 },
];

function viewOf(pathname: string): View {
  if (pathname === "/arsiv" || pathname.startsWith("/arsiv/")) return "arsiv";
  if (pathname === "/cop" || pathname.startsWith("/cop/")) return "cop";
  return "notlar";
}

/**
 * "Notlar · Arşiv · Çöp" görünüm kapsülü (kişisel alan: `/`, `/arsiv`, `/cop`).
 * Etiketler: masaüstünde hepsi, tablette yalnızca seçili, mobilde hiçbiri.
 */
export function ViewSwitch({ current, className }: { current?: View; className?: string }) {
  const { pathname } = useLocation();
  const active = current ?? viewOf(pathname);
  return (
    <nav
      aria-label="Görünüm"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-hover p-[3px]",
        className,
      )}
    >
      {VIEWS.map(({ id, label, to, icon: Icon }) => {
        const on = id === active;
        return (
          <Link
            key={id}
            to={to}
            title={label}
            aria-label={label}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted-foreground no-underline transition-colors outline-none hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50",
              on && "bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,.08)] hover:text-primary",
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className={cn("text-[13px]", on ? "hidden md:inline" : "hidden lg:inline")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
