import { Bell, Inbox, ShieldCheck, Trash2, User, UserMinus } from "lucide-react";
import { Link } from "react-router";
import { cn } from "cn";
import type { NotificationTone, NotificationView } from "~/domain/notifications/copy";

const TONES: Record<NotificationTone, { icon: typeof Bell; className: string }> = {
  atama: { icon: User, className: "bg-primary-soft text-primary" },
  hatirlatici: { icon: Bell, className: "bg-warn-soft text-warn" },
  davet: { icon: Inbox, className: "bg-note-mor text-fg" },
  rol: { icon: ShieldCheck, className: "bg-note-mavi text-fg" },
  silindi: { icon: Trash2, className: "bg-danger-soft text-danger" },
  cikarildi: { icon: UserMinus, className: "bg-danger-soft text-danger" },
};

/**
 * Tek bildirim satırı (Notifications `.ni`): türüne göre simge kutusu, kalın bölümlü metin,
 * alt satır ("·" ile) ve eylem bağlantısı; okunmamışta sağda yeşil nokta.
 */
export function NotificationItem({
  item,
  onOpen,
  className,
}: {
  item: NotificationView;
  onOpen?: (item: NotificationView) => void;
  className?: string;
}) {
  const tone = TONES[item.tone];
  const Icon = tone.icon;
  return (
    <Link
      to={item.href}
      onClick={() => onOpen?.(item)}
      data-bildirim={item.id}
      data-okunmadi={item.unread ? "" : undefined}
      className={cn(
        "relative flex gap-3 border-t border-line px-4 py-3 text-fg no-underline outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]",
          tone.className,
        )}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <span className={cn("min-w-0 flex-1", item.unread && "pr-4")}>
        <p className="m-0">
          {item.unread && <span className="sr-only">Okunmadı: </span>}
          {item.segments.map((s, i) =>
            s.strong ? (
              <strong key={i} className="font-semibold">
                {s.text}
              </strong>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
        <small className="text-xs text-muted-foreground">
          {item.meta.join(" · ")}
          {item.action && (
            <>
              {" · "}
              <span className="text-[13px] font-medium text-primary">{item.action}</span>
            </>
          )}
        </small>
      </span>
      {item.unread && (
        <span
          className="absolute top-[18px] right-4 size-2 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
