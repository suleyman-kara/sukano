import { FileText, Inbox, Menu, Plus, Settings, Trash2 } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "cn";
import { usePendingSectionPath } from "~/hooks/use-pending-section";
import { LogoMark } from "~/components/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { SidebarProjects } from "./sidebar-projects";
import type { ShellProject } from "./types";

type Variant = "responsive" | "drawer";

type SidebarNavProps = {
  projects: ShellProject[];
  pendingInviteCount: number;
  /** Yönetici olunan silinmiş projeler; 0 ise "Silinmiş projeler" bağlantısı gizli. */
  deletedProjectCount?: number;
  /** "Yeni proje" düğmesi (diyaloğu kabuk açar). */
  onNewProject?: () => void;
  /**
   * "responsive": kalıcı sol panel; tablette ve masaüstünde `data-nav="rail"`
   * iken 72 px ray olur (CSS `railed:` varyantı).
   * "drawer": mobil/tablet çekmecesi; her zaman açık hali.
   */
  variant: Variant;
  onNavigate?: () => void;
  /**
   * Masaüstü ve tablet (tasarım v2): sol üstteki logo menü düğmesidir; üzerine gelince ya
   * da odakta hamburgere döner, tıklama paneli açar/kapatır. Verilmezse (mobil çekmece)
   * logo ana sayfa bağlantısıdır.
   */
  onMenuToggle?: () => void;
  /** Panel (ya da tablet çekmecesi) açık mı: "Menüyü kapat" / "Menüyü aç". */
  menuExpanded?: boolean;
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
  "relative flex w-full items-center gap-3 rounded-[10px] px-3.5 py-[9px] font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 railed:mx-auto railed:size-(--nav-rail-item) railed:justify-center railed:gap-0 railed:p-0 pointer-coarse:railed:size-11";
const NAV_ACTIVE = "bg-primary-soft text-primary hover:bg-primary-soft";
const LABEL = "nav-label min-w-0 truncate railed:hidden";
const ICON = "size-(--nav-icon) shrink-0";

export function SidebarNav({
  projects,
  pendingInviteCount,
  deletedProjectCount = 0,
  onNewProject,
  variant,
  onNavigate,
  onMenuToggle,
  menuExpanded = false,
}: SidebarNavProps) {
  const rc = (classes: string) => railClasses(variant, classes);
  // Bölüm değişirken tıklanan öğe veri beklenmeden seçili görünür (`isPending`).
  const switching = usePendingSectionPath() !== null;
  const item = ({ isActive, isPending = false }: { isActive: boolean; isPending?: boolean }) =>
    cn(rc(NAV_ITEM), (switching ? isPending : isActive) && NAV_ACTIVE);

  return (
    <nav aria-label="Ana gezinme" className="flex min-h-0 flex-1 flex-col gap-0.5">
      {onMenuToggle ? (
        <div
          className={rc(
            "flex items-center gap-2.5 px-2.5 pt-1.5 pb-[22px] railed:justify-center railed:px-0",
          )}
        >
          <MenuLogoButton expanded={menuExpanded} onClick={onMenuToggle} />
          <Link
            to="/"
            onClick={onNavigate}
            aria-label="Sukano, ana sayfa"
            className={rc(
              "nav-label rounded-md text-lg leading-none font-bold tracking-[-0.01em] text-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 railed:hidden",
            )}
          >
            sukano
          </Link>
        </div>
      ) : (
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
      )}

      <NavLink
        to="/"
        end
        prefetch="intent"
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
          "nav-label px-3.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase railed:mx-1.5 railed:my-2.5 railed:h-px railed:overflow-hidden railed:bg-line railed:p-0 railed:text-[0px] railed:leading-none",
        )}
      >
        Projeler
      </div>

      <SidebarProjects
        projects={projects}
        itemClass={item}
        rc={rc}
        labelClass={rc(LABEL)}
        onNavigate={onNavigate}
      />

      <button
        type="button"
        onClick={onNewProject}
        className={cn(rc(NAV_ITEM), "text-muted-foreground")}
        title="Yeni proje"
        aria-label="Yeni proje"
        aria-haspopup="dialog"
      >
        <Plus className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc(LABEL)}>Yeni proje</span>
      </button>

      {deletedProjectCount > 0 && (
        <NavLink
          to="/silinmis-projeler"
          onClick={onNavigate}
          prefetch="intent"
          className={(state) =>
            cn(item(state), !state.isActive && "text-muted-foreground", "text-[13px]")
          }
          title={`Silinmiş projeler (${deletedProjectCount})`}
        >
          <Trash2 className={cn(ICON, "size-[18px]")} strokeWidth={1.75} aria-hidden="true" />
          <span className={rc("nav-label min-w-0 truncate railed:sr-only")}>
            Silinmiş projeler ({deletedProjectCount})
          </span>
        </NavLink>
      )}

      <div className="flex-1" />

      <NavLink
        to="/davetler"
        prefetch="intent"
        onClick={onNavigate}
        className={item}
        title="Davetler"
      >
        {/* Erişilebilir ad görünür metinden gelir (axe label-content-name-mismatch):
            "Davetler, 1 bekleyen davet". Rayda etiket görünmez ama okunur. */}
        <Inbox className={ICON} strokeWidth={1.75} aria-hidden="true" />
        <span className={rc("nav-label min-w-0 truncate railed:sr-only")}>Davetler</span>
        {pendingInviteCount > 0 && (
          <>
            <span
              className={rc(
                "ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground railed:absolute railed:top-1.5 railed:right-1.5 railed:m-0 railed:size-2 railed:p-0 railed:text-[0px] railed:leading-none",
              )}
              aria-hidden="true"
            >
              {pendingInviteCount}
            </span>
            <span className="sr-only">, {pendingInviteCount} bekleyen davet</span>
          </>
        )}
      </NavLink>

      <NavLink
        to="/ayarlar"
        prefetch="intent"
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

/**
 * Logo ↔ menü düğmesi (tasarım v2, NavStates): logo 120 ms'de solar ve küçülür, hamburger
 * aynı yerde dönerek belirir (180 ms); dokunmatikte basılıyken. Bkz. `.logo-tg` (app.css).
 */
function MenuLogoButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  const label = expanded ? "Menüyü kapat" : "Menüyü aç";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="logo-tg"
          aria-label={label}
          aria-expanded={expanded}
          onClick={onClick}
        >
          <LogoMark size={28} className="logo-mark" />
          <Menu className="logo-burger" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Kalıcı sol panel: mobilde gizli, tablette ray, masaüstünde 248/72 px. */
export function Sidebar(props: Omit<SidebarNavProps, "variant" | "onNavigate">) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-line px-3 py-5 whitespace-nowrap transition-[width] duration-(--dur-medium) ease-(--ease-out) md:flex railed:w-[72px] railed:duration-(--dur-small) railed:ease-(--ease-in) reduced-motion:transition-none">
      <SidebarNav {...props} variant="responsive" />
    </aside>
  );
}
