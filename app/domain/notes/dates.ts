/**
 * Tarih metinleri. Sunucu ve istemci aynı metni üretsin diye (hidrasyon) saat
 * dilimi sabittir: varsayılan Türkiye (PLAN §5).
 */

export const DEFAULT_TIME_ZONE = "Europe/Istanbul";
export const TRASH_RETENTION_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

const parts = (date: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    f.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month").replace(/\.$/, ""),
    day: get("day"),
    time: `${get("hour")}:${get("minute")}`,
  };
};

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);

/** "5 Kas, 14:20"; başka yıldaysa "5 Kas 2025, 14:20". */
export function formatShortDateTime(date: Date, now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const p = parts(date, timeZone);
  const sameYear = p.year === parts(now, timeZone).year;
  return `${p.day} ${p.month}${sameYear ? "" : ` ${p.year}`}, ${p.time}`;
}

/** Sürüm listesi: "Bugün, 14:20", "Dün, 17:48", "4 Kas, 09:30". */
export function formatRelativeDateTime(date: Date, now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const key = dayKey(date, timeZone);
  const time = parts(date, timeZone).time;
  if (key === dayKey(now, timeZone)) return `Bugün, ${time}`;
  if (key === dayKey(new Date(now.getTime() - DAY), timeZone)) return `Dün, ${time}`;
  return formatShortDateTime(date, now, timeZone);
}

/** Çöpteki notun kalıcı silinmesine kalan tam gün (0–7). */
export function trashDaysLeft(trashedAt: Date, now = new Date()): number {
  const remaining = TRASH_RETENTION_DAYS * DAY - Math.max(0, now.getTime() - trashedAt.getTime());
  return Math.min(TRASH_RETENTION_DAYS, Math.max(0, Math.ceil(remaining / DAY)));
}

export function trashLeftLabel(days: number): string {
  return days <= 0 ? "Bugün silinir" : `${days} gün sonra silinir`;
}
