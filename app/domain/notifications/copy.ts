/**
 * Bildirim metinleri (tasarım: Notifications, MNotifications, TNotifications; push örnekleri
 * States2). Satır verisinden arayüzün çizeceği parçalar (kalın bölümler), alt satır, eylem
 * bağlantısı ve açılacak adres üretilir. Saf: sunucu biçimlendirir, istemci aynen çizer
 * (göreli zaman metni hidrasyonda değişmesin).
 */
import { PROJECT_ROLES, type NotificationType, type ProjectRole } from "~/db/schema";
import { PROJECT_RETENTION_MS } from "~/domain/projects/lifecycle";
import { roleLabel } from "~/domain/projects/permissions";
import { reminderMomentLabel, resolveTimeZone, zonedParts } from "~/domain/reminders/time";
import { addDays, formatDay, todayIn } from "~/domain/tasks/dates";

/** Veritabanı satırı + birleştirilen adlar. */
export type NotificationRow = {
  id: string;
  type: NotificationType;
  data: Record<string, unknown>;
  /** ms */
  createdAt: number;
  readAt: number | null;
  projectId: string | null;
  noteId: string | null;
  /** Yapan kişinin adı; hesabı silindiyse ya da yoksa null. */
  actorName: string | null;
  /** Projenin şu anki adı (proje kalıcı silindiyse null; o zaman `data.projectName`). */
  projectName: string | null;
};

export type NotificationTone = "atama" | "hatirlatici" | "davet" | "rol" | "silindi" | "cikarildi";

export type NotificationSegment = { text: string; strong?: boolean };

/** Arayüzün çizdiği bildirim. */
export type NotificationView = {
  id: string;
  type: NotificationType;
  tone: NotificationTone;
  unread: boolean;
  /** Tıklanınca açılan site içi adres. */
  href: string;
  segments: NotificationSegment[];
  /** Alt satır parçaları ("·" ile birleştirilir). */
  meta: string[];
  /** Alt satırın sonundaki vurgulu eylem ("Notu aç", "Davetleri gör"). */
  action: string | null;
  createdAt: number;
};

export type CopyContext = { now: number; timeZone: string };

const DELETED_USER = "Silinmiş kullanıcı";
const UNTITLED = "Başlıksız not";
const MIN = 60_000;
const MONTHS_FULL = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const roleOf = (v: unknown): ProjectRole | null =>
  PROJECT_ROLES.includes(v as ProjectRole) ? (v as ProjectRole) : null;

/** Bildirim listesindeki zaman: "şimdi", "25 dk önce", "bugün 14:05", "dün 18:40", "3 Kas". */
export function notificationTimeLabel(at: number, now: number, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  const diff = now - at;
  if (diff < MIN) return "şimdi";
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)} dk önce`;
  const p = zonedParts(at, tz);
  const today = todayIn(new Date(now), tz);
  if (p.date === today) return `bugün ${p.time}`;
  if (p.date === addDays(today, -1)) return `dün ${p.time}`;
  return formatDay(p.date, today);
}

/** "11 Kasım'a" (Türkçe yönelme eki, ünlü uyumu). */
function untilLabel(ms: number, timeZone: string): string {
  const [, m, d] = zonedParts(ms, timeZone).date.split("-").map(Number) as [number, number, number];
  const month = MONTHS_FULL[m - 1]!;
  const suffix = /[eiöü][^aeıioöuü]*$/.test(month) ? "'e" : "'a";
  return `${d} ${month}${suffix}`;
}

function noteHref(row: NotificationRow): string {
  if (!row.noteId) return "/";
  const note = encodeURIComponent(row.noteId);
  return row.projectId ? `/proje/${encodeURIComponent(row.projectId)}/not/${note}` : `/not/${note}`;
}

const projectNameOf = (row: NotificationRow) =>
  row.projectName ?? (str(row.data.projectName) || "Proje");

/** Satırı arayüz için biçimlendirir. */
export function renderNotification(row: NotificationRow, ctx: CopyContext): NotificationView {
  const tz = resolveTimeZone(ctx.timeZone);
  const when = notificationTimeLabel(row.createdAt, ctx.now, tz);
  const actor = row.actorName ?? DELETED_USER;
  const project = projectNameOf(row);
  const base = {
    id: row.id,
    type: row.type,
    unread: row.readAt === null,
    createdAt: row.createdAt,
  };

  switch (row.type) {
    case "goreve_atandi": {
      const task = str(row.data.taskTitle) || "Başlıksız görev";
      return {
        ...base,
        tone: "atama",
        href: noteHref(row),
        segments: [{ text: actor, strong: true }, { text: ` seni "${task}" görevine atadı.` }],
        meta: [project, str(row.data.noteTitle) || UNTITLED, when],
        action: null,
      };
    }
    case "hatirlatici": {
      const isTask = row.data.targetType === "task";
      const noteTitle = str(row.data.noteTitle) || UNTITLED;
      const title = isTask ? str(row.data.taskTitle) || "Başlıksız görev" : noteTitle;
      const at = num(row.data.at) ?? row.createdAt;
      const scope = row.projectId ? [project] : ["Kişisel not"];
      return {
        ...base,
        tone: "hatirlatici",
        href: noteHref(row),
        segments: [{ text: "Hatırlatıcı: " }, { text: title, strong: true }],
        meta: [...scope, ...(isTask ? [noteTitle] : []), reminderMomentLabel(at, ctx.now, tz)],
        action: row.noteId ? "Notu aç" : null,
      };
    }
    case "davet": {
      const role = roleOf(row.data.role);
      return {
        ...base,
        tone: "davet",
        href: "/davetler",
        segments: [
          { text: actor, strong: true },
          { text: " seni " },
          { text: project, strong: true },
          {
            text: ` projesine ${role ? `${roleLabel(role).toLocaleLowerCase("tr")} olarak ` : ""}davet etti.`,
          },
        ],
        meta: [when],
        action: "Davetleri gör",
      };
    }
    case "rol_degisti": {
      const role = roleOf(row.data.role);
      return {
        ...base,
        tone: "rol",
        href: row.projectId ? `/proje/${encodeURIComponent(row.projectId)}` : "/",
        segments: [
          { text: project, strong: true },
          { text: " projesindeki rolün " },
          { text: role ? roleLabel(role).toLocaleLowerCase("tr") : "değişti", strong: true },
          { text: " olarak değişti." },
        ],
        meta: [actor, when],
        action: null,
      };
    }
    case "proje_silindi":
      return {
        ...base,
        tone: "silindi",
        href: "/silinmis-projeler",
        segments: [
          { text: project, strong: true },
          {
            text: ` projesi silindi. Proje ${untilLabel(row.createdAt + PROJECT_RETENTION_MS, tz)} kadar geri getirilebilir; sonra notlar kalıcı olarak silinir.`,
          },
        ],
        meta: [actor, when],
        action: null,
      };
    case "projeden_cikarildi":
      return {
        ...base,
        tone: "cikarildi",
        href: "/",
        segments: [{ text: project, strong: true }, { text: " projesinden çıkarıldın." }],
        meta: [actor, when],
        action: null,
      };
  }
}

/** Bildirimin düz metni (ekran okuyucu, push gövdesi). */
export const plainText = (view: Pick<NotificationView, "segments">) =>
  view.segments.map((s) => s.text).join("");

export type PushPayload = {
  title: string;
  body: string;
  /** Bildirime tıklanınca açılacak site içi adres. */
  url: string;
  /** Aynı bildirimin tekrarını tek gösterim yapar. */
  tag: string;
  action?: string;
};

/**
 * Tarayıcı bildirimi (States2 "Push bildirimi · işletim sistemi"). Push yalnızca
 * hatırlatıcı, göreve atanma ve davette gider (PLAN §5); diğerlerinde null.
 */
export function pushPayloadFor(row: NotificationRow, ctx: CopyContext): PushPayload | null {
  const view = renderNotification(row, ctx);
  const project = projectNameOf(row);
  switch (row.type) {
    case "hatirlatici":
      return {
        title: plainText(view),
        body: view.meta.join(" · "),
        url: view.href,
        tag: row.id,
        action: "Notu aç",
      };
    case "goreve_atandi":
      return {
        title: `${row.actorName ?? DELETED_USER} seni bir göreve atadı`,
        body: [str(row.data.taskTitle) || "Başlıksız görev", project].join(" · "),
        url: view.href,
        tag: row.id,
      };
    case "davet": {
      const role = roleOf(row.data.role);
      return {
        title: `${project} projesine davet`,
        body: [row.actorName ?? DELETED_USER, ...(role ? [roleLabel(role)] : [])].join(" · "),
        url: view.href,
        tag: row.id,
      };
    }
    default:
      return null;
  }
}
