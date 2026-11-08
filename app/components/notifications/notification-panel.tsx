import { Skeleton } from "~/components/ui/skeleton";
import { Settings } from "lucide-react";
import { Link } from "react-router";
import { cn } from "cn";
import { NotificationItem } from "./notification-item";
import type { useNotificationFeed } from "./use-notifications";

type Feed = ReturnType<typeof useNotificationFeed>;

const LINK =
  "rounded-md text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50";

/**
 * Bildirim listesi gövdesi: başlık satırı (Bildirimler · Tümünü okundu say · ayarlar),
 * satırlar, "Daha eski bildirimler". Zil panelinde ve mobil `/bildirimler` sayfasında ortak.
 */
export function NotificationList({
  feed,
  unread,
  onNavigate,
  variant = "panel",
  headingId,
}: {
  feed: Feed;
  unread: number;
  onNavigate?: () => void;
  variant?: "panel" | "page";
  headingId?: string;
}) {
  const page = variant === "page";
  const hasUnread = unread > 0 || feed.items.some((i) => i.unread);
  return (
    <>
      {!page && (
        <div className="flex items-center gap-2 py-2 pr-2 pl-4 lg:gap-3 lg:pt-3.5 lg:pb-2.5">
          <h2 id={headingId} className="m-0 flex-1 text-base font-semibold">
            Bildirimler
          </h2>
          <button
            type="button"
            className={LINK}
            disabled={!hasUnread}
            onClick={() => void feed.markAllRead()}
          >
            Tümünü okundu say
          </button>
          <Link
            to="/ayarlar#bildirim"
            aria-label="Bildirim ayarları"
            title="Bildirim ayarları"
            onClick={onNavigate}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-[30px]"
          >
            <Settings className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      )}
      <div
        className={cn(page && "border-y border-line bg-surface [&>a:first-child]:border-t-0")}
        aria-busy={feed.loading || undefined}
      >
        {feed.items.map((item) => (
          <NotificationItem
            key={item.id}
            item={item}
            onOpen={(i) => {
              if (i.unread) void feed.markRead(i.id);
              onNavigate?.();
            }}
          />
        ))}
        {!feed.loading && feed.items.length === 0 && (
          <p className="m-0 border-t border-line px-4 py-8 text-center text-muted-foreground [:first-child]:border-t-0">
            {feed.error ? "Bildirimler yüklenemedi." : "Henüz bildirimin yok."}
          </p>
        )}
        {feed.loading && feed.items.length === 0 && <Skeleton lines={3} className="px-4 py-5" />}
      </div>
      {feed.hasMore && (
        <div className={cn("text-center", page ? "pt-2" : "border-t border-line px-4 py-2.5")}>
          <button
            type="button"
            className={cn(LINK, page && "min-h-11 px-3 text-[15px]")}
            onClick={() => void feed.loadMore()}
          >
            Daha eski bildirimler
          </button>
        </div>
      )}
    </>
  );
}
