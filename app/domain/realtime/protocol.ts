/**
 * Gerçek zamanlı protokol (Aşama 4). İki tür WebSocket vardır:
 *
 * 1. **Not odası** `GET /api/notlar/:id/canli` → `NoteRoom` (not başına bir Durable Object).
 *    - İkili çerçeveler: y-protocols (y-websocket ile aynı): `varUint tür` + yük.
 *      `0` eşitleme (sync step 1 / step 2 / update), `1` farkındalık (varlık, imleç),
 *      `3` farkındalık sorgusu (sunucu → istemci: "durumunu yeniden gönder").
 *    - Metin çerçeveleri: JSON uygulama iletileri (`NoteServerMessage`, `NoteClientMessage`).
 * 2. **Kanal** `GET /api/kanal/proje/:id` ve `GET /api/kanal/kisisel` → `ProjectRoom`
 *    (proje başına / kişi başına bir Durable Object). Yalnızca sunucu → istemci JSON
 *    (`ChannelServerMessage`); ızgarayı canlı tutan küçük olaylar (`grid-events.ts`).
 */
import type { Task } from "~/domain/tasks/model";
import type { ChannelEvent } from "./grid-events";
import { parseChannelEvent } from "./grid-events";

/* ------------------------------------------------------------------ */
/* Yollar                                                               */
/* ------------------------------------------------------------------ */

export const noteLivePath = (noteId: string) => `/api/notlar/${encodeURIComponent(noteId)}/canli`;
export const projectChannelPath = (projectId: string) =>
  `/api/kanal/proje/${encodeURIComponent(projectId)}`;
export const PERSONAL_CHANNEL_PATH = "/api/kanal/kisisel";

const ID = "[A-Za-z0-9_-]{1,128}";
const NOTE_PATH = new RegExp(`^/api/notlar/(${ID})/canli$`);
const PROJECT_PATH = new RegExp(`^/api/kanal/proje/(${ID})$`);

export type LiveRoute =
  { kind: "note"; noteId: string } | { kind: "project"; projectId: string } | { kind: "personal" };

/** Worker yönlendirmesi: canlı yollardan biri mi? */
export function parseLivePath(pathname: string): LiveRoute | null {
  const note = NOTE_PATH.exec(pathname);
  if (note) return { kind: "note", noteId: note[1]! };
  const project = PROJECT_PATH.exec(pathname);
  if (project) return { kind: "project", projectId: project[1]! };
  if (pathname === PERSONAL_CHANNEL_PATH) return { kind: "personal" };
  return null;
}

/** Kanal Durable Object adı. */
export type ChannelKey =
  { kind: "project"; projectId: string } | { kind: "personal"; userId: string };

export const channelName = (key: ChannelKey) =>
  key.kind === "project" ? `proje:${key.projectId}` : `kisi:${key.userId}`;

/** Yjs belgesinde not gövdesinin alanı (Collaboration eklentisinin varsayılanı). */
export const NOTE_FRAGMENT = "default";

/* ------------------------------------------------------------------ */
/* İkili (y-protocols) ileti türleri                                    */
/* ------------------------------------------------------------------ */

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_QUERY_AWARENESS = 3;

/* ------------------------------------------------------------------ */
/* Kapanış kodları (sunucu kapatınca)                                   */
/* ------------------------------------------------------------------ */

export const CLOSE_CODES = {
  /** Sunucu yeniden bağlanmayı istiyor (rol değişti …). İstemci hemen yeniden bağlanır. */
  yenidenBaglan: 4000,
  /** Belge sıfırlandı (dönüşüm, sürüm geri yükleme): istemci belgeyi atıp yeniden bağlanır. */
  sifirlandi: 4009,
  /** Erişim kalktı (projeden çıkarıldı, not silindi): istemci yeniden denemez. */
  erisimYok: 4404,
} as const;

/** Bu kodlarla kapanan bağlantı yeniden denenmez. */
export const isFatalClose = (code: number) => code === CLOSE_CODES.erisimYok;

/* ------------------------------------------------------------------ */
/* JSON iletiler                                                        */
/* ------------------------------------------------------------------ */

export type AssigneeMap = Record<string, string[]>;

/** Görev durumu yayını: sunucunun tek sıradaki (seq) yetkili listesi. */
export type TaskBroadcast = {
  t: "gorevler";
  /** Odanın görev sıra numarası (artan). HTTP yanıtı da aynı numarayı taşır. */
  seq: number;
  tasks: Task[];
  assignees: AssigneeMap;
  /** İşlemi yapan kullanıcı. */
  by: string;
};

/** Notun HTTP ile değişen alanları (başlık, renk, sabit, arşiv, çöp). */
export type NoteMetaPatch = {
  title?: string;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
  trashed?: boolean;
  /** Not başka bir alana taşındı (kişisel ↔ proje). */
  moved?: boolean;
  /** Ekler değişti (eklendi / kaldırıldı): istemci ek listesini yeniden yükler. */
  attachments?: boolean;
};

export type NoteServerMessage =
  | {
      /** Bağlantı kabul edildi; eşitlemeden önce gelir. */
      t: "hosgeldin";
      /** Yjs belgesinin kimliği: değiştiyse istemci elindeki belgeyi atar (sıfırlama). */
      docId: string;
      kind: "text" | "todo";
      readOnly: boolean;
      /** Oturumdaki kişi (sunucunun gördüğü haliyle). */
      user: { id: string; name: string; color: string };
      /** Son görev sıra numarası. */
      seq: number;
    }
  | TaskBroadcast
  | ({ t: "not"; by: string } & NoteMetaPatch)
  | { t: "kaydedildi"; at: number }
  | { t: "sifirla" }
  | { t: "rol"; readOnly: boolean }
  | { t: "hata"; code: "salt_okunur" | "gecersiz"; message: string };

export type NoteClientMessage =
  /** Bekleyen değişiklikleri hemen D1'e yaz (not kapanırken); yanıt `kaydedildi`. */
  { t: "kaydet" } | { t: "ping" };

export type ChannelServerMessage =
  { t: "hosgeldin"; seq: number } | { t: "olay"; seq: number; event: ChannelEvent };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw);
    return isObject(v) ? v : null;
  } catch {
    return null;
  }
}

const isStringArrayMap = (v: unknown): v is AssigneeMap =>
  isObject(v) &&
  Object.values(v).every((a) => Array.isArray(a) && a.every((x) => typeof x === "string"));

/** İstemci: sunucudan gelen not odası iletisini doğrular. */
export function parseNoteServerMessage(raw: string): NoteServerMessage | null {
  const m = parseJson(raw);
  if (!m) return null;
  switch (m.t) {
    case "hosgeldin":
      return typeof m.docId === "string" &&
        (m.kind === "text" || m.kind === "todo") &&
        typeof m.readOnly === "boolean" &&
        isObject(m.user) &&
        typeof m.user.id === "string" &&
        typeof m.seq === "number"
        ? (m as unknown as NoteServerMessage)
        : null;
    case "gorevler":
      return typeof m.seq === "number" &&
        Array.isArray(m.tasks) &&
        isStringArrayMap(m.assignees) &&
        typeof m.by === "string"
        ? (m as unknown as TaskBroadcast)
        : null;
    case "not":
      return typeof m.by === "string" ? (m as unknown as NoteServerMessage) : null;
    case "kaydedildi":
      return typeof m.at === "number" ? { t: "kaydedildi", at: m.at } : null;
    case "sifirla":
      return { t: "sifirla" };
    case "rol":
      return typeof m.readOnly === "boolean" ? { t: "rol", readOnly: m.readOnly } : null;
    case "hata":
      return (m.code === "salt_okunur" || m.code === "gecersiz") && typeof m.message === "string"
        ? { t: "hata", code: m.code, message: m.message }
        : null;
    default:
      return null;
  }
}

/** Sunucu: istemciden gelen JSON iletiyi doğrular. */
export function parseNoteClientMessage(raw: string): NoteClientMessage | null {
  const m = parseJson(raw);
  if (m?.t === "kaydet") return { t: "kaydet" };
  if (m?.t === "ping") return { t: "ping" };
  return null;
}

/** İstemci: kanal iletisini doğrular. */
export function parseChannelServerMessage(raw: string): ChannelServerMessage | null {
  const m = parseJson(raw);
  if (!m || typeof m.seq !== "number") return null;
  if (m.t === "hosgeldin") return { t: "hosgeldin", seq: m.seq };
  if (m.t === "olay") {
    const event = parseChannelEvent(m.event);
    return event ? { t: "olay", seq: m.seq, event } : null;
  }
  return null;
}
