/**
 * Hatırlatıcı zamanları (PLAN §5): saat dilimi tarayıcıdan gelir, varsayılan Türkiye.
 * Tarih ve saat kişinin saat diliminde yorumlanıp UTC ana (ms) çevrilir; metinler de
 * o saat dilimine göre yazılır. Saf modül: sunucu ve istemci aynı kodu kullanır.
 */
import { addDays, formatDay, quickDates, todayIn } from "~/domain/tasks/dates";

export const DEFAULT_TIME_ZONE = "Europe/Istanbul";
/** Saati olmayan görev bitiş tarihinin hatırlatıcı saati. */
export const DEFAULT_REMINDER_TIME = "09:00";
/** "Bugün" hızlı seçeneğinin saati; bu saat geçtiyse seçenek gösterilmez. */
export const EVENING_TIME = "18:00";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** Geçerli bir IANA saat dilimi mi? */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Geçersiz ya da boşsa varsayılan (İstanbul). */
export function resolveTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wall(ms: number, timeZone: string) {
  const parts = wallFormatter(timeZone).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Saat diliminin o andaki UTC farkı (ms; İstanbul için +3 saat). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wall(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Saat dilimindeki yerel tarih + saat → UTC anı (ms). Yaz saati geçişlerinde: olmayan
 * yerel saat (ileri geçiş) boşluk kadar ileri kayar; iki kez yaşanan saat (geri geçiş)
 * ilk anı seçer.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
  const tz = resolveTimeZone(timeZone);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetAt(guess - DAY, tz);
  const after = offsetAt(guess + DAY, tz);
  const valid = [before, after]
    .map((o) => guess - o)
    .filter((t) => offsetAt(t, tz) === guess - t)
    .sort((a, b) => a - b);
  return valid[0] ?? guess - before;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC anı → saat dilimindeki tarih (`YYYY-MM-DD`) ve saat (`HH:MM`). */
export function zonedParts(ms: number, timeZone: string): { date: string; time: string } {
  const w = wall(ms, resolveTimeZone(timeZone));
  return {
    date: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** Görev hatırlatıcısı: bitiş tarihi + saat (yoksa 09:00) kişinin saat diliminde. */
export function taskReminderAt(
  dueDate: string | null,
  dueTime: string | null,
  timeZone: string,
): number | null {
  if (!dueDate) return null;
  return zonedToUtc(dueDate, dueTime ?? DEFAULT_REMINDER_TIME, timeZone);
}

const weekdayOf = (iso: string) => WEEKDAYS_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

export type QuickReminderOption = {
  key: "bugun" | "yarin" | "hafta";
  label: string;
  hint: string;
  date: string;
  time: string;
};

/**
 * Hatırlatıcı seçicinin hızlı seçenekleri (Forms / MReminder): "Bugün 18:00" (saat
 * geçmediyse), "Yarın 09:00", "Gelecek hafta" (pazartesi) 09:00.
 */
export function quickReminderOptions(now: number, timeZone: string): QuickReminderOption[] {
  const tz = resolveTimeZone(timeZone);
  const { date: today, time: nowTime } = zonedParts(now, tz);
  const q = quickDates(today);
  const out: QuickReminderOption[] = [];
  if (nowTime < EVENING_TIME) {
    out.push({ key: "bugun", label: "Bugün", hint: EVENING_TIME, date: today, time: EVENING_TIME });
  }
  out.push(
    {
      key: "yarin",
      label: "Yarın",
      hint: `${weekdayOf(q.tomorrow)}, ${DEFAULT_REMINDER_TIME}`,
      date: q.tomorrow,
      time: DEFAULT_REMINDER_TIME,
    },
    {
      key: "hafta",
      label: "Gelecek hafta",
      hint: `${weekdayOf(q.nextWeek)}, ${formatDay(q.nextWeek, today)}, ${DEFAULT_REMINDER_TIME}`,
      date: q.nextWeek,
      time: DEFAULT_REMINDER_TIME,
    },
  );
  return out;
}

function dayWord(date: string, today: string): "bugün" | "yarın" | "dün" | null {
  if (date === today) return "bugün";
  if (date === addDays(today, 1)) return "yarın";
  if (date === addDays(today, -1)) return "dün";
  return null;
}

/** Notta ve kartta hatırlatıcı çipi: "Bugün, 18:00", "Yarın, 09:00", "9 Kas, 09:00". */
export function reminderChipLabel(at: number, now: number, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  const p = zonedParts(at, tz);
  const today = todayIn(new Date(now), tz);
  const word = dayWord(p.date, today);
  const day = word
    ? word.charAt(0).toLocaleUpperCase("tr") + word.slice(1)
    : formatDay(p.date, today);
  return `${day}, ${p.time}`;
}

/** Bildirimde hatırlatıcının anı: "bugün 09:00", "dün 09:00", "2 Kas, 09:00". */
export function reminderMomentLabel(at: number, now: number, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  const p = zonedParts(at, tz);
  const today = todayIn(new Date(now), tz);
  const word = dayWord(p.date, today);
  return word ? `${word} ${p.time}` : `${formatDay(p.date, today)}, ${p.time}`;
}

const CITY_NAMES: Record<string, string> = { Istanbul: "İstanbul", Izmir: "İzmir" };

/** "Europe/Istanbul" → "İstanbul", "America/New_York" → "New York". */
export function timeZoneLabel(timeZone: string): string {
  const city = (timeZone.split("/").at(-1) ?? timeZone).replace(/_/g, " ");
  return CITY_NAMES[city] ?? city;
}
