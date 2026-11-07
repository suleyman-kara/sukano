import { Bell, Menu, Search } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { AccountMenu } from "./account-menu";
import type { ShellUser } from "./types";
import { ViewSwitch } from "./view-switch";

type TopbarProps = {
  user: ShellUser;
  unreadNotificationCount: number;
  showViewSwitch: boolean;
  menuExpanded: boolean;
  onMenuClick: () => void;
};

export function Topbar({
  user,
  unreadNotificationCount,
  showViewSwitch,
  menuExpanded,
  onMenuClick,
}: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const q =
    location.pathname === "/ara" ? (new URLSearchParams(location.search).get("q") ?? "") : "";

  return (
    <header className="flex items-center gap-1 px-2 pt-3 pb-2 md:gap-2 md:pt-3 md:pr-5 md:pb-2 md:pl-4 lg:gap-3 lg:px-8 lg:pt-3.5 lg:pb-1.5">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Gezinme menüsü"
        aria-expanded={menuExpanded}
        title="Gezinme menüsü"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-9"
      >
        <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      <form
        role="search"
        method="get"
        action="/ara"
        className="relative block min-w-0 flex-1 lg:max-w-[620px]"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          navigate(value ? `/ara?q=${encodeURIComponent(value)}` : "/ara");
        }}
      >
        <label htmlFor="genel-arama" className="sr-only">
          Ara
        </label>
        <Search
          className="pointer-events-none absolute top-3 left-3.5 hidden size-5 text-muted-foreground md:block"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          key={q}
          id="genel-arama"
          name="q"
          type="search"
          defaultValue={q}
          enterKeyHint="search"
          placeholder="Notlarda ve projelerde ara"
          className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:pl-11 md:text-sm"
        />
      </form>

      {showViewSwitch && <ViewSwitch className="hidden md:inline-flex" />}

      <div className="hidden flex-1 lg:block" />

      <Link
        to="/bildirimler"
        aria-label={
          unreadNotificationCount > 0
            ? `Bildirimler, ${unreadNotificationCount} yeni`
            : "Bildirimler"
        }
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-9"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {unreadNotificationCount > 0 && (
          <span
            className="absolute top-2.5 right-[11px] box-content size-2 rounded-full border-2 border-bg bg-danger lg:top-[7px] lg:right-2"
            aria-hidden="true"
          />
        )}
      </Link>

      <AccountMenu user={user} />
    </header>
  );
}
