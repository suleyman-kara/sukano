/**
 * Canlı katmanın arayüz metinleri ve kararları (saf; Aşama 4b):
 *
 * - `syncLabel`: "Son eşitleme: az önce / 5 dk önce / bugün 14:02 / dün 09:30 / 4 Kas 14:02".
 * - `stackPeers` / `presenceLabel`: not köşesindeki varlık avatarları (üst üste, fazlası "+n").
 * - `remoteNoteOutcome`: açık nota başka yerden gelen değişiklik (çöp, arşiv, taşıma)
 *   notu kapatır mı, toast metni ne.
 * - `projectChannelOutcome`: proje kanalında silme / üyelik olayı bu kişiyi ilgilendiriyor mu.
 */
import { DEFAULT_TIME_ZONE } from "~/domain/notes/dates";
import type { ChannelEvent } from "./grid-events";
import type { Peer } from "./presence";
import type { NoteMetaPatch } from "./protocol";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const dayKey = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(ms);

const clock = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);

const shortDate = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone, day: "numeric", month: "short" })
    .format(ms)
    .replace(/\.$/, "");

/**
 * Göreli eşitleme zamanı (tasarım: "Son eşitleme: bugün 14:02"). Bir dakikadan yeni
 * "az önce", bir saatten yeni "n dk önce", aynı gün "bugün HH:MM", önceki gün
 * "dün HH:MM", daha eski "4 Kas 14:02". Zaman yoksa null.
 */
export function syncLabel(
  at: number | null,
  now: number,
  timeZone = DEFAULT_TIME_ZONE,
): string | null {
  if (at === null) return null;
  const ago = Math.max(0, now - at);
  let when: string;
  if (ago < MINUTE) when = "az önce";
  else if (ago < 60 * MINUTE) when = `${Math.floor(ago / MINUTE)} dk önce`;
  else if (dayKey(at, timeZone) === dayKey(now, timeZone)) when = `bugün ${clock(at, timeZone)}`;
  else if (dayKey(at, timeZone) === dayKey(now - DAY, timeZone))
    when = `dün ${clock(at, timeZone)}`;
  else when = `${shortDate(at, timeZone)} ${clock(at, timeZone)}`;
  return `Son eşitleme: ${when}`;
}

/** Göreli metnin yenilenme aralığı (ms): ilk saatte dakikada bir, sonra seyrek. */
export function syncLabelRefreshMs(at: number | null, now: number): number | null {
  if (at === null) return null;
  return now - at < 60 * MINUTE ? 15_000 : 5 * MINUTE;
}

/** Varlık avatarları: en çok `max` kişi gösterilir, fazlası "+n" (n ≥ 2; tek kişi için yer açılır). */
export function stackPeers<T>(peers: readonly T[], max = 3): { shown: T[]; extra: number } {
  if (peers.length <= max) return { shown: [...peers], extra: 0 };
  const shown = peers.slice(0, max - 1);
  return { shown, extra: peers.length - shown.length };
}

/** Ekran okuyucu ve ipucu metni: "Ayşe Demir bu notu açık tutuyor" … */
export function presenceLabel(peers: readonly Pick<Peer, "name">[]): string {
  const names = peers.map((p) => p.name);
  if (names.length === 0) return "Notu başka kimse açık tutmuyor";
  if (names.length === 1) return `${names[0]} bu notu açık tutuyor`;
  const head = names.slice(0, -1).join(", ");
  return `${head} ve ${names.at(-1)} bu notu açık tutuyor`;
}

/** Görev satırındaki odak göstergesi metni: "Mehmet Kaya bu görevde". */
export function taskFocusLabel(peers: readonly Pick<Peer, "name">[]): string {
  const names = peers.map((p) => p.name);
  if (names.length <= 1) return `${names[0] ?? "Biri"} bu görevde`;
  return `${names.slice(0, -1).join(", ")} ve ${names.at(-1)} bu görevde`;
}

export type Person = { id: string; name: string };

/** Olayı yapan kişinin adı (bilinmiyorsa "Başka biri"). */
export function actorName(by: string, people: readonly Person[] = []): string {
  return people.find((p) => p.id === by)?.name ?? "Başka biri";
}

export type RemoteNoteOutcome = {
  /** Not kapatılır mı. */
  close: boolean;
  /** Toast (yoksa sessiz: ör. kendi başka sekmenden). */
  toast: { title: string; description?: string; undo?: "restore" | "unarchive" } | null;
};

const NONE: RemoteNoteOutcome = { close: false, toast: null };

/**
 * Açık nota başka yerden gelen alanlar: çöpe atıldı, arşivlendi ya da başka alana
 * taşındıysa not kapanır. Kendi yaptığın (başka sekmede) değişiklikte toast sade.
 * `view`: notun açıldığı görünüm (arşivden açılan not arşivlenince kapanmaz).
 */
export function remoteNoteOutcome(
  meta: NoteMetaPatch & { by: string },
  ctx: { me: string | null; people?: readonly Person[]; view?: "notlar" | "arsiv" },
): RemoteNoteOutcome {
  const self = ctx.me !== null && meta.by === ctx.me;
  const who = self ? "Sen" : actorName(meta.by, ctx.people);
  if (meta.trashed === true) {
    return {
      close: true,
      toast: {
        title: self ? "Not başka bir sekmede çöpe atıldı" : `${who} bu notu çöpe attı`,
        description: "Not 7 gün Çöp'te kalır.",
        undo: "restore",
      },
    };
  }
  if (meta.moved === true) {
    return {
      close: true,
      toast: {
        title: self ? "Not başka bir sekmede taşındı" : `${who} bu notu başka bir alana taşıdı`,
      },
    };
  }
  if (meta.archived === true && ctx.view !== "arsiv") {
    return {
      close: true,
      toast: {
        title: self ? "Not başka bir sekmede arşivlendi" : `${who} bu notu arşivledi`,
        undo: "unarchive",
      },
    };
  }
  if (meta.archived === false && ctx.view === "arsiv") {
    return {
      close: true,
      toast: { title: self ? "Not arşivden çıkarıldı" : `${who} bu notu arşivden çıkardı` },
    };
  }
  return NONE;
}

export type ProjectChannelOutcome =
  | { kind: "deleted"; title: string; description: string }
  /** Bu kişinin üyeliği değişti: çıkarıldı mı, rolü mü değişti — sunucuya sorulur. */
  | { kind: "membership" }
  | null;

/** Proje kanalı olayı bu kişiyi sayfadan çıkarmayı gerektiriyor mu. */
export function projectChannelOutcome(
  event: ChannelEvent,
  ctx: { me: string | null; projectName: string; people?: readonly Person[] },
): ProjectChannelOutcome {
  if (event.by === ctx.me) return null;
  if (event.type === "proje-silindi") {
    return {
      kind: "deleted",
      title: `${ctx.projectName} silindi`,
      description: `${actorName(event.by, ctx.people)} bu projeyi sildi. Notlarım'a döndün.`,
    };
  }
  if (event.type === "uyelik" && event.userId === ctx.me) return { kind: "membership" };
  return null;
}
