import { useState } from "react";
import { SkipLink } from "~/components/skip-link";
import { Avatar } from "~/components/avatar";
import { NewProjectDialog } from "~/components/projects/new-project-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/ui/sheet";
import { DESKTOP_QUERY, TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useRouteFade } from "~/hooks/use-route-fade";
import { useNavMode } from "~/lib/nav-state";
import { Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellData } from "./types";
import type { ViewSwitchTarget } from "./view-switch";

type AppShellProps = ShellData & {
  /** "Notlar · Arşiv · Çöp" kapsülü yalnızca alan sayfalarında (Notlarım, proje). */
  showViewSwitch?: boolean;
  /** Kapsülün alanı (varsayılan Notlarım; projede `/proje/:id`). */
  viewSwitch?: ViewSwitchTarget;
  /** Mobilde üst çubuk gizlensin mi (kendi başlığı olan alt sayfalar: proje ayarları). */
  hideMobileTopbar?: boolean;
  children: React.ReactNode;
};

/**
 * Uygulama kabuğu.
 * - ≥ 1024 px: kalıcı sol panel; sol üstteki logo menü düğmesidir (üzerine gelince
 *   hamburgere döner) ve paneli 248 ↔ 72 px arasında geçirir (localStorage'da saklanır).
 * - 768–1023 px: ray varsayılan; logo açık paneli çekmece olarak açar, çekmecedeki logo
 *   kapatır.
 * - < 768 px: panel gizli; üst çubuktaki hamburger çekmeceyi (Sheet) açar.
 */
export function AppShell({
  user,
  projects,
  pendingInviteCount,
  deletedProjectCount,
  unreadNotificationCount,
  showViewSwitch = false,
  viewSwitch,
  hideMobileTopbar = false,
  children,
}: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const isTabletUp = useMediaQuery(TABLET_UP_QUERY, true);
  const { mode, toggle } = useNavMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRouteFade<HTMLElement>();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const openNewProject = () => {
    setDrawerOpen(false);
    setNewProjectOpen(true);
  };

  const onMenuClick = () => {
    if (window.matchMedia(DESKTOP_QUERY).matches) toggle();
    else setDrawerOpen(true);
  };

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <SkipLink />
      <Sidebar
        projects={projects}
        pendingInviteCount={pendingInviteCount}
        deletedProjectCount={deletedProjectCount}
        onNewProject={openNewProject}
        onMenuToggle={onMenuClick}
        menuExpanded={isDesktop ? mode === "open" : drawerOpen}
      />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />

      <Sheet open={drawerOpen && !isDesktop} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[304px] gap-0 border-r-0 bg-bg px-3 pt-[max(20px,env(safe-area-inset-top))] pb-7 shadow-[0_0_40px_rgba(0,0,0,.25)] data-[side=left]:w-[304px] data-[side=left]:sm:max-w-[304px]"
        >
          <SheetTitle className="sr-only">Ana gezinme</SheetTitle>
          <SheetDescription className="sr-only">
            Notlarım, projeler, davetler ve ayarlar
          </SheetDescription>
          <SidebarNav
            variant="drawer"
            projects={projects}
            pendingInviteCount={pendingInviteCount}
            deletedProjectCount={deletedProjectCount}
            onNewProject={openNewProject}
            onNavigate={() => setDrawerOpen(false)}
            {...(isTabletUp
              ? { onMenuToggle: () => setDrawerOpen(false), menuExpanded: true }
              : {})}
          />
          <div className="mt-2 flex items-center gap-3 border-t border-line px-3.5 pt-3.5">
            <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={36} />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          unreadNotificationCount={unreadNotificationCount}
          showViewSwitch={showViewSwitch}
          viewSwitch={viewSwitch}
          className={hideMobileTopbar ? "max-md:hidden" : undefined}
          menuExpanded={isDesktop ? mode === "open" : drawerOpen}
          onMenuClick={onMenuClick}
        />
        <main
          ref={mainRef}
          id="icerik"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
