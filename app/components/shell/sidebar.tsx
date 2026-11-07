import { FileText, Inbox, Plus, Settings } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "cn";
import { LogoMark } from "~/components/logo";
import type { ShellProject } from "./types";

type Variant = "responsive" | "drawer";

type SidebarNavProps = {
  projects: ShellProject[];
  pendingInviteCount: number;
  /**
   * "responsive": kalıcı sol panel; tablette ve masaüstünde `data-nav="rail"`
   * iken 72 px ray olur (CSS `railed:` varyantı).
   * "drawer": mobil/tablet çekmecesi; her zaman açık hali.
   */
  variant: Variant;
  onNavigate?: () => void;
};

/** Çekmecede ray kurallarını kaldırır (sınıflar kaynakta tam yazılı kalır). */
function railClasses(variant: Variant, classes: string) {
  if (variant === "responsive") return classes;
  return classes
    .split(" ")
    .filter((c) => !c.startsWith("railed:"))
    .join(" ");
}

const NAV_ITEM =
  "relative flex w-full items-center gap-3 rounded-[10px] px-3.5 py-[9px] font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 railed:mx-auto railed:size-11 railed:justify-center railed:gap-0 railed:p-0";
const NAV_ACTIVE = "bg-primary-soft text-primary hover:bg-primary-soft";
const LABEL = "min-w-0 truncate railed:hidden";
const ICON = "size-5 shrink-0";

export function SidebarNav({ projects, pendingInviteCount, variant, onNavigate }: SidebarNavProps) {
  const rc = (classes: string) => railClasses(variant, classes);
  const item = ({ isActive }: { isActive: boolean }) => cn(rc(NAV_ITEM), isActive && NAV_ACTIVE);

  return (
    <nav aria-label="Ana gezinme" className="flex min-h-0 flex-1 flex-col gap-0.5">
      <Link
        to="/"
        onClick={onNavigate}
        aria-label="Sukano, ana sayfa"
        title="Sukano"
        className={rc(
          "flex items-center gap-2.5 rounded-[10px] px-3 pt-1.5 pb-[22px] text-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 railed:justify-center railed:px-0",
        )}
      >
        <LogoMark size={28} />
        <span className={rc("text-lg leading-none font-bold tracking-[-0.01em] railed:hidden")}>
          sukano
        </span>
      </Link>

      <NavLink
        to="/"
        end
        onClick={onNavigate}
        className={item}
        title="Notlarım"
        aria-label="Notlarım"
      >
        <FileText className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc(LABEL)}>Notlarım</span>
      </NavLink>

      <div
        className={rc(
          "px-3.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase railed:mx-1.5 railed:my-2.5 railed:h-px railed:overflow-hidden railed:bg-line railed:p-0 railed:text-[0px] railed:leading-none",
        )}
      >
        Projeler
      </div>

      {projects.map((project) => (
        <NavLink
          key={project.id}
          to={`/p/${project.id}`}
          onClick={onNavigate}
          className={item}
          title={project.name}
          aria-label={project.name}
        >
          <span
            className={rc("mx-[5px] size-2.5 shrink-0 rounded-full railed:hidden")}
            style={{ background: `var(--p-${project.color})` }}
            aria-hidden="true"
          />
          <span
            className={rc(
              "hidden size-7 shrink-0 items-center justify-center rounded-full text-xs leading-none font-semibold text-white railed:inline-flex",
            )}
            style={{ background: `var(--p-${project.color})` }}
            aria-hidden="true"
          >
            {project.name.trim().charAt(0).toLocaleUpperCase("tr-TR")}
          </span>
          <span className={rc(LABEL)}>{project.name}</span>
        </NavLink>
      ))}

      <button
        type="button"
        className={cn(rc(NAV_ITEM), "text-muted-foreground")}
        title="Yeni proje (yakında)"
        aria-label="Yeni proje"
      >
        <Plus className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc(LABEL)}>Yeni proje</span>
      </button>

      <div className="flex-1" />

      <NavLink
        to="/davetler"
        onClick={onNavigate}
        className={item}
        title="Davetler"
        aria-label={
          pendingInviteCount > 0 ? `Davetler, ${pendingInviteCount} bekleyen davet` : "Davetler"
        }
      >
        <Inbox className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc(LABEL)}>Davetler</span>
        {pendingInviteCount > 0 && (
          <span
            className={rc(
              "ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground railed:absolute railed:top-1.5 railed:right-1.5 railed:m-0 railed:size-2 railed:p-0 railed:text-[0px] railed:leading-none",
            )}
            aria-hidden="true"
          >
            {pendingInviteCount}
          </span>
        )}
      </NavLink>

      <NavLink
        to="/ayarlar"
        onClick={onNavigate}
        className={item}
        title="Ayarlar"
        aria-label="Ayarlar"
      >
        <Settings className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc(LABEL)}>Ayarlar</span>
      </NavLink>
    </nav>
  );
}

/** Kalıcı sol panel: mobilde gizli, tablette ray, masaüstünde 248/72 px. */
export function Sidebar(props: Omit<SidebarNavProps, "variant" | "onNavigate">) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-line px-3 py-5 whitespace-nowrap transition-[width] duration-[180ms] ease-spring md:flex railed:w-[72px] reduced-motion:transition-none">
      <SidebarNav {...props} variant="responsive" />
    </aside>
  );
}
