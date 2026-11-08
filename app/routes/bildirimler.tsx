import { ArrowLeft, Settings } from "lucide-react";
import { Link } from "react-router";
import { NotificationList } from "~/components/notifications/notification-panel";
import { useNotificationFeed, useUnreadCount } from "~/components/notifications/use-notifications";
import { AppShell } from "~/components/shell/app-shell";
import { getCloudflare } from "~/lib/context";
import { listNotifications } from "~/lib/notifications.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/bildirimler";

export const meta: Route.MetaFunction = () => [{ title: "Bildirimler · Sukano" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return { page: await listNotifications(getCloudflare(context).env, user.id) };
}

const ICON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Bildirimler sayfası (MNotifications): mobilde zilin açtığı tam sayfa; masaüstü ve
 * tablette zil paneli kullanılır ama adres doğrudan açılırsa aynı liste gösterilir.
 */
export default function Bildirimler({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const feed = useNotificationFeed({ initial: loaderData.page });
  const unread = useUnreadCount(shell.unreadNotificationCount, { live: false });
  const hasUnread = unread > 0 || feed.items.some((i) => i.unread);

  return (
    <AppShell {...shell} hideMobileTopbar>
      <section className="flex w-full max-w-[720px] flex-col gap-2 pb-8 md:gap-4 md:px-7 md:pt-3 lg:px-8">
        <header className="flex items-center gap-0.5 px-2 pt-[max(12px,env(safe-area-inset-top))] md:px-0 md:pt-0">
          <Link to="/" aria-label="Geri" className={`${ICON} md:hidden`}>
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="m-0 flex-1 text-xl font-bold md:text-2xl md:tracking-[-0.01em]">
            Bildirimler
          </h1>
          <button
            type="button"
            disabled={!hasUnread}
            onClick={() => void feed.markAllRead()}
            className="h-11 rounded-md px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
          >
            Tümünü okundu say
          </button>
          <Link to="/ayarlar#bildirim" aria-label="Bildirim ayarları" className={ICON}>
            <Settings className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </header>
        <div className="md:overflow-hidden md:rounded-[14px] md:border md:border-line md:bg-surface [&>div:first-child]:md:border-0">
          <NotificationList feed={feed} unread={unread} variant="page" />
        </div>
      </section>
    </AppShell>
  );
}
