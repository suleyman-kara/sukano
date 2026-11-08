import { Bell } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { NotificationList } from "./notification-panel";
import { useNotificationFeed, useSyncTimeZone, useUnreadCount } from "./use-notifications";

const BUTTON =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-hover aria-expanded:text-fg lg:size-9";

const label = (n: number) => (n > 0 ? `Bildirimler, ${n} yeni` : "Bildirimler");

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="bildirim-rozeti"
      className="absolute top-2.5 right-[11px] box-content size-2 rounded-full border-2 border-bg bg-danger lg:top-[7px] lg:right-2"
      aria-hidden="true"
    />
  );
}

/**
 * Üst çubuktaki zil (Notifications / TNotifications / MNotifications): okunmamış varsa
 * kırmızı nokta ("Bildirimler, 2 yeni"). Masaüstü ve tablette açılır panel, mobilde
 * `/bildirimler` sayfasına bağlantı. Sayı kişisel kanaldan canlı güncellenir.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const unread = useUnreadCount(initialUnread);
  useSyncTimeZone();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Link to="/bildirimler" aria-label={label(unread)} className={cn(BUTTON, "md:hidden")}>
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        <Badge count={unread} />
      </Link>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={label(unread)} className={cn(BUTTON, "max-md:hidden")}>
            <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
            <Badge count={unread} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          role="dialog"
          aria-labelledby="bildirim-paneli-baslik"
          className="max-h-[min(640px,calc(100dvh-90px))] w-[min(420px,calc(100vw-32px))] gap-0 overflow-y-auto rounded-[14px] border border-line bg-surface p-0 text-sm text-fg shadow-elevated ring-0"
        >
          {open && <BellPanel unread={unread} onNavigate={() => setOpen(false)} />}
        </PopoverContent>
      </Popover>
    </>
  );
}

function BellPanel({ unread, onNavigate }: { unread: number; onNavigate: () => void }) {
  const feed = useNotificationFeed();
  return (
    <NotificationList
      feed={feed}
      unread={unread}
      onNavigate={onNavigate}
      headingId="bildirim-paneli-baslik"
    />
  );
}
