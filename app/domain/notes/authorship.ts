/**
 * Proje notunda "oluşturan / son düzenleyen" satırı (PLAN §2; TodoNote `.meta`):
 * "Ayşe Demir oluşturdu · Son düzenleyen Mehmet Kaya, 2 saat önce". Kişi hesabını
 * sildiyse adı "Silinmiş kullanıcı" görünür.
 */
import { DEFAULT_TIME_ZONE, formatShortDateTime } from "./dates";

export const DELETED_USER = "Silinmiş kullanıcı";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);

/** "az önce", "5 dakika önce", "2 saat önce", "dün", "3 gün önce", sonra "4 Kas, 09:30". */
export function formatAgo(date: Date, now = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return "az önce";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} dakika önce`;
  const today = dayKey(now, timeZone);
  if (dayKey(date, timeZone) === today) return `${Math.floor(diff / HOUR)} saat önce`;
  if (dayKey(date, timeZone) === dayKey(new Date(now.getTime() - DAY), timeZone)) return "dün";
  if (diff < 7 * DAY) return `${Math.max(2, Math.round(diff / DAY))} gün önce`;
  return formatShortDateTime(date, now, timeZone);
}

type Person = { name: string } | null;

export const personName = (p: Person) => p?.name.trim() || DELETED_USER;

/** Oluşturan / son düzenleyen satırı. */
export function authorshipLine(
  createdBy: Person,
  updatedBy: Person,
  updatedAt: Date,
  now = new Date(),
): string {
  return `${personName(createdBy)} oluşturdu · Son düzenleyen ${personName(updatedBy)}, ${formatAgo(updatedAt, now)}`;
}
