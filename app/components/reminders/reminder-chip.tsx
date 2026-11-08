import { Bell } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { reminderChipLabel } from "~/domain/reminders/time";

/**
 * Kaydedilen not hatırlatıcısı çipi (Forms "Kişisel notta"): yeşil zeminde zil + "Yarın,
 * 09:00". `onClick` varsa düğmedir (seçiciyi açar).
 */
export function ReminderChip({
  at,
  timeZone,
  now,
  onClick,
  className,
}: {
  at: number;
  timeZone: string;
  now?: number;
  onClick?: () => void;
  className?: string;
}) {
  const [mountedAt] = useState(() => Date.now());
  const label = reminderChipLabel(at, now ?? mountedAt, timeZone);
  const cls = cn(
    "inline-flex h-[30px] shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary-soft pr-2.5 pl-2 text-[13px] font-medium text-primary outline-none [&_svg]:size-[15px]",
    onClick && "hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50",
    className,
  );
  const content = (
    <>
      <Bell aria-hidden="true" strokeWidth={1.9} />
      {label}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={`Hatırlatıcı: ${label}`}>
      {content}
    </button>
  ) : (
    <span className={cls} aria-label={`Hatırlatıcı: ${label}`} role="img">
      {content}
    </span>
  );
}
