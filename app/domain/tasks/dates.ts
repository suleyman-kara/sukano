/**
 * Görev tarihleri (PLAN §3, §10): Türkçe doğal yazım çözümleme, aralık metni
 * ("12 → 20 Kas", "Bugün"), başlangıç ≤ bitiş kuralı. Takvim tarihleri `YYYY-MM-DD`,
 * saatler `HH:MM` metindir; "bugün" her zaman dışarıdan verilir (saat dilimi
 * Europe/Istanbul, bkz. {@link todayIn}).
 */
import { DEFAULT_TIME_ZONE } from "~/domain/notes/dates";

export type DateRange = { startDate: string | null; dueDate: string | null };
export type ParsedDate = { date: string; time: string | null };
export type DateSlot = "start" | "due";

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_FOLDED = [
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik",
];
const WEEKDAYS: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  sali: 2,
  carsamba: 3,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Verilen saat diliminde bugünün tarihi (`YYYY-MM-DD`). */
export function todayIn(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(now);
}

/** Türkçe harfleri sadeleştirir, küçültür, boşlukları teke indirir. */
function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Bugünden sonraki ilk `dow` günü (bugün o günse bir hafta sonrası). */
const nextWeekday = (today: string, dow: number) =>
  addDays(today, (dow - weekday(today) + 7) % 7 || 7);

/** Gün/ay (yıl isteğe bağlı) → tarih; yıl yoksa geçmişteyse ertesi yıl. */
function dayMonth(day: number, month: number, year: number | null, today: string): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  let y = year ?? Number(today.slice(0, 4));
  let c = isoOf(y, month, day);
  if (!isValidDate(c) && year !== null) return null;
  if (year === null && (c < today || !isValidDate(c))) {
    // Geçmiş tarih (ya da bu yıl geçersiz 29 Şubat) → ertesi yıl.
    y += 1;
    c = isoOf(y, month, day);
  }
  return isValidDate(c) ? c : null;
}

function parseDatePart(s: string, today: string): string | null {
  if (s === "bugun") return today;
  if (s === "yarin") return addDays(today, 1);
  if (s === "obur gun" || s === "oburgun") return addDays(today, 2);
  if (s === "gelecek hafta" || s === "haftaya") return nextWeekday(today, 1);
  if (s in WEEKDAYS) return nextWeekday(today, WEEKDAYS[s]!);

  const named = s.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/);
  if (named) {
    const word = named[2]!;
    const mi = MONTHS_FOLDED.findIndex(
      (m) => m === word || (word.length >= 3 && m.startsWith(word)),
    );
    if (mi < 0) return null;
    return dayMonth(Number(named[1]), mi + 1, named[3] ? Number(named[3]) : null, today);
  }
  const numeric = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
  if (numeric) {
    return dayMonth(
      Number(numeric[1]),
      Number(numeric[2]),
      numeric[3] ? Number(numeric[3]) : null,
      today,
    );
  }
  return null;
}

/**
 * Türkçe doğal yazım: "bugün", "yarın", "öbür gün", "gelecek hafta" / "haftaya",
 * gün adları (bir sonraki o gün), "15 kasım", "15 kas", "15.11", "15.11.2027";
 * aksansız yazım da olur. Sonda isteğe bağlı saat: "yarın 17:00", "cuma saat 9.30".
 * Çözülemezse null.
 */
export function parseNaturalDate(text: string, today: string): ParsedDate | null {
  let s = fold(text);
  let time: string | null = null;
  const tm = s.match(/ (?:saat )?(\d{1,2})[:.](\d{2})$/);
  if (tm) {
    const h = Number(tm[1]);
    const m = Number(tm[2]);
    if (h > 23 || m > 59) return null;
    time = `${pad(h)}:${tm[2]}`;
    s = s.slice(0, tm.index).trim();
  }
  if (!s) return null;
  const date = parseDatePart(s, today);
  return date ? { date, time } : null;
}

/** "6 Kas"; bugünün yılından farklıysa "6 Kas 2027". */
export function formatDay(iso: string | null, today: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const base = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  return y === today.slice(0, 4) ? base : `${base} ${y}`;
}

/**
 * Satır ipucu ve çip için aralık metni: "20 Kas", "12 → 20 Kas", "28 Eki → 3 Kas",
 * "Bugün", "3 Kas → Bugün", "12 Kas →". Başlangıç bitişten önce değilse yalnızca bitiş.
 */
export function formatRange(
  startDate: string | null,
  dueDate: string | null,
  today: string,
): string {
  const start = startDate && dueDate && startDate >= dueDate ? null : startDate;
  if (!start && !dueDate) return "";
  if (!dueDate) return `${formatDay(start, today)} →`;
  const end = dueDate === today ? "Bugün" : formatDay(dueDate, today);
  if (!start) return end;
  if (dueDate !== today && start.slice(0, 7) === dueDate.slice(0, 7)) {
    return `${Number(start.slice(8))} → ${end}`;
  }
  return `${formatDay(start, today)} → ${end}`;
}

/** Akordeondaki tarih çipi: aralık + (bitiş varsa) saat: "3 → 12 Kas, 17:00". */
export function formatChip(
  startDate: string | null,
  dueDate: string | null,
  dueTime: string | null,
  today: string,
): string {
  const range = formatRange(startDate, dueDate, today);
  return range && dueDate && dueTime ? `${range}, ${dueTime}` : range;
}

/** Başlangıç bitişten sonraysa başlangıç bitişe eşitlenir (yeni nesne döner). */
export function fixRange<T extends DateRange>(range: T): T {
  if (range.startDate && range.dueDate && range.startDate > range.dueDate) {
    return { ...range, startDate: range.dueDate };
  }
  return { ...range };
}

/**
 * Tarih seçicide bir yuvaya tarih yazar; kural bozulursa başlangıç bitişe eşitlenir
 * ve kullanıcıya gösterilecek uyarı döner.
 */
export function pickDate(
  range: DateRange,
  slot: DateSlot,
  date: string,
): DateRange & { warning: string | null } {
  const current = fixRange({ startDate: range.startDate, dueDate: range.dueDate });
  let warning: string | null = null;
  if (slot === "start" && current.dueDate && date > current.dueDate) {
    warning = "Başlangıç bitişten sonra olamaz; bitişe eşitlendi.";
  }
  if (slot === "due" && current.startDate && date < current.startDate) {
    warning = "Bitiş başlangıçtan önce; başlangıç bitişe eşitlendi.";
  }
  const next = fixRange({
    startDate: slot === "start" ? date : current.startDate,
    dueDate: slot === "due" ? date : current.dueDate,
  });
  return { ...next, warning };
}

/** Bitiş tarihi geçmiş ve görev açıksa gecikmiştir (kırmızı). */
export function isOverdue(dueDate: string | null, today: string, done = false): boolean {
  return !done && dueDate !== null && dueDate < today;
}

/** Tarih seçicinin hızlı seçenekleri. "Gelecek hafta" bir sonraki pazartesidir. */
export function quickDates(today: string) {
  return { today, tomorrow: addDays(today, 1), nextWeek: nextWeekday(today, 1) };
}
