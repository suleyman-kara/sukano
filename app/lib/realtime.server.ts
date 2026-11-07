/**
 * Gerçek zamanlı katmanın sunucu yardımcıları (Worker ve Durable Object'ler ortak):
 *
 * - `persistCollabText`: NoteRoom'un periyodik yazımı — Yjs belgesinden üretilen HTML'i
 *   notun D1 kopyasına (`body_html`, `body_text`) yazar, `updated_by` / `updated_at`'i
 *   günceller ve sürüm penceresini düzenleyenlere göre uygular.
 * - `publishChannel`: proje / kişisel alan kanalına (ProjectRoom) olay yayınlar.
 * - `notifyNoteRoom`: HTTP ile değişen not alanlarını açık odaya bildirir (başlık, renk …)
 *   ya da belgeyi sıfırlatır (dönüşüm, sürüm geri yükleme, HTTP ile gövde yazımı).
 * - `noteIntentEffects`: `/api/notlar` eyleminin kanal olayları ve oda bildirimleri.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { createDb } from "~/db/client";
import { notes } from "~/db/schema";
import { htmlToText } from "~/domain/notes/html";
import type { NoteIntent } from "~/domain/notes/validation";
import type { ProjectIntent } from "~/domain/projects/validation";
import type { ChannelEventBody } from "~/domain/realtime/grid-events";
import { channelName, type ChannelKey, type NoteMetaPatch } from "~/domain/realtime/protocol";
import { collabVersionWriteOps, runBatch } from "./note-store.server";
import { bodyTextOf } from "./notes.server";

type DbEnv = { DB: D1Database };
type RoomsEnv = Pick<Env, "NOTE_ROOM" | "PROJECT_ROOM">;

/* ------------------------------------------------------------------ */
/* Metin notunun D1 kopyası                                             */
/* ------------------------------------------------------------------ */

export type PersistInput = {
  noteId: string;
  /** Yjs belgesinden üretilen HTML. */
  html: string;
  /** Odanın son yazdığı (ya da belgeyi doldurduğu) D1 HTML'i. */
  lastHtml: string;
  /** Son yazımdan bu yana düzenleyenler (en son düzenleyen sonda). */
  editors: readonly string[];
  now: Date;
};

export type PersistResult =
  | { status: "ok"; channel: ChannelKey; by: string }
  | { status: "unchanged" }
  /** D1'deki gövde odanın dışında değişmiş (sürüm geri yükleme …): oda sıfırlanmalı. */
  | { status: "external" }
  /** Not yok ya da artık metin notu değil. */
  | { status: "gone" };

export const channelOfNote = (row: {
  ownerUserId: string | null;
  projectId: string | null;
}): ChannelKey | null =>
  row.projectId
    ? { kind: "project", projectId: row.projectId }
    : row.ownerUserId
      ? { kind: "personal", userId: row.ownerUserId }
      : null;

/**
 * Yjs → D1 yazımı. Yalnızca D1'deki gövde odanın bildiğiyle (`lastHtml`) aynıysa yazar
 * (koşullu güncelleme): araya HTTP ile giren bir gövde değişikliği ezilmez, `external`
 * döner. Sürüm: `decideCollabVersionWrite` (kişi başına + 5 dk).
 */
export async function persistCollabText(env: DbEnv, input: PersistInput): Promise<PersistResult> {
  const db = createDb(env.DB);
  const row = await db
    .select({
      kind: notes.kind,
      title: notes.title,
      bodyHtml: notes.bodyHtml,
      ownerUserId: notes.ownerUserId,
      projectId: notes.projectId,
    })
    .from(notes)
    .where(eq(notes.id, input.noteId))
    .get();
  const channel = row ? channelOfNote(row) : null;
  if (!row || row.kind !== "text" || !channel) return { status: "gone" };
  const current = row.bodyHtml ?? "";
  if (current !== input.lastHtml) return { status: "external" };
  if (input.html === current) return { status: "unchanged" };
  const by = input.editors.at(-1) ?? null;
  const result = await db
    .update(notes)
    .set({
      bodyHtml: input.html,
      bodyText: bodyTextOf(row.title, input.html),
      ...(by ? { updatedBy: by } : {}),
      updatedAt: input.now,
    })
    .where(
      and(
        eq(notes.id, input.noteId),
        eq(notes.kind, "text"),
        sql`coalesce(${notes.bodyHtml}, '') = ${current}`,
      ),
    )
    .run();
  if (!result.meta.changes) return { status: "external" };
  await runBatch(
    db,
    await collabVersionWriteOps(
      db,
      input.noteId,
      "text",
      row.title,
      { html: input.html, text: htmlToText(input.html) },
      input.editors,
      input.now,
    ),
  );
  return { status: "ok", channel, by: by ?? "" };
}

/* ------------------------------------------------------------------ */
/* Yayın                                                               */
/* ------------------------------------------------------------------ */

/** Kanala olayları yayınlar; hata günlüğe yazılır, fırlatılmaz (yayın en iyi çabadır). */
export async function publishChannel(
  env: RoomsEnv,
  key: ChannelKey,
  events: readonly ChannelEventBody[],
  by: string,
  now = Date.now(),
): Promise<void> {
  if (events.length === 0) return;
  try {
    const room = env.PROJECT_ROOM.getByName(channelName(key));
    for (const event of events) await room.publish({ ...event, by, at: now });
  } catch (error) {
    console.error("[canlı] kanal yayını başarısız:", error);
  }
}

export type NoteRoomChange = {
  by: string;
  meta?: NoteMetaPatch;
  /** Belge D1'den yeniden kurulmalı (gövde odanın dışında değişti). */
  reset?: boolean;
  /** Not kalıcı silindi: bağlantılar kapanır, oda boşaltılır. */
  deleted?: boolean;
};

export async function notifyNoteRoom(
  env: RoomsEnv,
  noteId: string,
  change: NoteRoomChange,
): Promise<void> {
  try {
    await env.NOTE_ROOM.getByName(noteId).noteChanged(change);
  } catch (error) {
    console.error("[canlı] not odası bildirimi başarısız:", error);
  }
}

/** Kişi projeden çıkarılınca proje kanalındaki bağlantıları kapanır. */
export async function disconnectFromChannel(env: RoomsEnv, key: ChannelKey, userId: string) {
  try {
    await env.PROJECT_ROOM.getByName(channelName(key)).disconnectUser(userId);
  } catch (error) {
    console.error("[canlı] kanal bağlantısı kapatılamadı:", error);
  }
}

/* ------------------------------------------------------------------ */
/* /api/notlar eylemlerinin etkileri                                    */
/* ------------------------------------------------------------------ */

/** Eylemden önce okunan bilgi (silinen notun alanı, boşaltılacak çöp). */
export type IntentContext = {
  /** Notun eylemden önceki kanalı (not kimliği olan eylemlerde). */
  before: ChannelKey | null;
  /** `empty-trash`: silinecek notlar. */
  trashed: string[];
};

/** Eylem çalışmadan önce gereken bilgiyi okur (yetki eylemin kendisinde denetlenir). */
export async function readIntentContext(
  env: DbEnv,
  userId: string,
  intent: NoteIntent,
): Promise<IntentContext> {
  const db = createDb(env.DB);
  if (intent.intent === "empty-trash") {
    const scope = intent.projectId
      ? eq(notes.projectId, intent.projectId)
      : eq(notes.ownerUserId, userId);
    const rows = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(scope, isNotNull(notes.trashedAt)));
    return { before: null, trashed: rows.map((r) => r.id) };
  }
  if (!("id" in intent) || intent.intent === "create" || intent.intent === "create-todo")
    return { before: null, trashed: [] };
  const row = await db
    .select({ ownerUserId: notes.ownerUserId, projectId: notes.projectId })
    .from(notes)
    .where(eq(notes.id, intent.id))
    .get();
  return { before: row ? channelOfNote(row) : null, trashed: [] };
}

export type IntentEffects = {
  channels: { key: ChannelKey; events: ChannelEventBody[] }[];
  room?: { noteId: string; change: Omit<NoteRoomChange, "by"> };
};

/**
 * Başarılı eylemin kanal olayları ve oda bildirimi (saf; yayın `applyIntentEffects`).
 * `userId`: eylemi yapan; kişisel alan kanalı onun kanalıdır.
 */
export function noteIntentEffects(
  intent: NoteIntent,
  userId: string,
  ctx: IntentContext,
): IntentEffects {
  const personal: ChannelKey = { kind: "personal", userId };
  const project = (projectId: string): ChannelKey => ({ kind: "project", projectId });
  const here = ctx.before;
  const on = (key: ChannelKey | null, ...events: ChannelEventBody[]) =>
    key ? [{ key, events }] : [];
  switch (intent.intent) {
    case "create":
    case "create-todo":
      return {
        channels: on(intent.projectId ? project(intent.projectId) : personal, {
          type: "olusturuldu",
          noteId: intent.id,
        }),
      };
    case "empty-trash":
      return {
        channels: on(intent.projectId ? project(intent.projectId) : personal, {
          type: "silindi",
          noteIds: ctx.trashed,
        }),
      };
    case "update":
      return {
        channels: on(here, { type: "icerik", noteId: intent.id }),
        room: {
          noteId: intent.id,
          change: {
            ...(intent.title !== undefined ? { meta: { title: intent.title } } : {}),
            ...(intent.bodyHtml !== undefined ? { reset: true } : {}),
          },
        },
      };
    case "convert":
    case "restore-version":
      return {
        channels: on(here, { type: "icerik", noteId: intent.id }),
        room: { noteId: intent.id, change: { reset: true } },
      };
    case "color":
      return {
        channels: on(here, { type: "renk", noteId: intent.id, color: intent.color }),
        room: { noteId: intent.id, change: { meta: { color: intent.color } } },
      };
    case "pin":
      return {
        channels: on(here, { type: "sabit", noteId: intent.id, pinned: intent.pinned }),
        room: { noteId: intent.id, change: { meta: { pinned: intent.pinned } } },
      };
    case "move":
      return {
        channels: on(here, {
          type: "sira",
          noteId: intent.id,
          pinned: intent.pinned,
          toIndex: intent.toIndex,
        }),
      };
    case "archive":
    case "unarchive":
      return {
        channels: on(here, {
          type: intent.intent === "archive" ? "arsivlendi" : "arsivden-cikti",
          noteId: intent.id,
        }),
        room: { noteId: intent.id, change: { meta: { archived: intent.intent === "archive" } } },
      };
    case "trash":
    case "restore":
      return {
        channels: on(here, {
          type: intent.intent === "trash" ? "cope-atildi" : "geri-yuklendi",
          noteId: intent.id,
        }),
        room: { noteId: intent.id, change: { meta: { trashed: intent.intent === "trash" } } },
      };
    case "delete":
    case "discard":
      return {
        channels: on(here, { type: "silindi", noteIds: [intent.id] }),
        room: { noteId: intent.id, change: { deleted: true } },
      };
    case "duplicate":
      return { channels: on(here, { type: "olusturuldu", noteId: intent.newId }) };
    case "move-to-project":
      return {
        channels: [
          ...on(here, { type: "tasindi", noteId: intent.id }),
          ...on(project(intent.projectId), { type: "olusturuldu", noteId: intent.id }),
        ],
      };
    case "undo-move":
      return {
        channels: [
          ...on(here, { type: "tasindi", noteId: intent.id }),
          ...on(personal, { type: "olusturuldu", noteId: intent.id }),
        ],
      };
    case "copy-to":
      return {
        channels: on(intent.projectId ? project(intent.projectId) : personal, {
          type: "olusturuldu",
          noteId: intent.newId,
        }),
      };
  }
}

/** Etkileri yayınlar (yanıtı bekletmemek için `ctx.waitUntil` ile çağrılır). */
export async function applyIntentEffects(env: RoomsEnv, userId: string, effects: IntentEffects) {
  await Promise.all([
    ...effects.channels.map((c) => publishChannel(env, c.key, c.events, userId)),
    ...(effects.room && Object.keys(effects.room.change).length
      ? [notifyNoteRoom(env, effects.room.noteId, { ...effects.room.change, by: userId })]
      : []),
  ]);
}

/* ------------------------------------------------------------------ */
/* /api/projeler/:id ve /api/davetler eylemlerinin etkileri             */
/* ------------------------------------------------------------------ */

/**
 * Proje eyleminden sonra proje kanalına olay: bilgi / davet değişikliği `proje`, silme
 * `proje-silindi`, rol değişikliği / çıkarma / ayrılma `uyelik`. Çıkarılan ve ayrılan
 * kişinin kanal bağlantıları kapanır (açık not odaları rolü en geç 30 sn'de yeniden denetler).
 */
export async function applyProjectIntentEffects(
  env: RoomsEnv,
  userId: string,
  projectId: string,
  intent: ProjectIntent,
) {
  const key: ChannelKey = { kind: "project", projectId };
  switch (intent.intent) {
    case "delete":
      return publishChannel(env, key, [{ type: "proje-silindi" }], userId);
    case "leave":
      await publishChannel(env, key, [{ type: "uyelik", userId }], userId);
      return disconnectFromChannel(env, key, userId);
    case "set-role":
      return publishChannel(env, key, [{ type: "uyelik", userId: intent.userId }], userId);
    case "remove-member":
      await publishChannel(env, key, [{ type: "uyelik", userId: intent.userId }], userId);
      return disconnectFromChannel(env, key, intent.userId);
    default:
      return publishChannel(env, key, [{ type: "proje" }], userId);
  }
}
