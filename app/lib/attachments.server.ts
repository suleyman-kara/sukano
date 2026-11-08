/**
 * Dosya ekleri (PLAN §3): yalnızca metin notunda, R2 (`FILES`) üzerinde, dosya başına
 * 10 MB. Yetki notun erişimiyle aynıdır (`noteScope`):
 *
 * - Okuma ve indirme: kişisel notta sahibi, proje notunda her üye (görüntüleyici dahil).
 * - Ekleme ve kaldırma: kişisel notta sahibi, projede yönetici ve düzenleyici
 *   (`note.edit`); görüntüleyici 403.
 * - Not sahibi / proje üyesi olmayan için ek yoktur (404) — ek kimliği tahmin edilse de.
 *
 * İndirme Worker üzerinden akar (kova herkese açık değil). Ek eklemek ve kaldırmak notun
 * "son düzenleyen" bilgisini günceller ama sürüm üretmez (sürümler metin ve görev
 * ağacının anlık görüntüsüdür; sürüm geri yükleme ekleri değiştirmez).
 */
import { and, count, eq } from "drizzle-orm";
import { createDb } from "~/db/client";
import { attachments, notes } from "~/db/schema";
import {
  checkAttachment,
  MESSAGES,
  r2KeyFor,
  sanitizeFileName,
  type AttachmentErrorCode,
} from "~/domain/attachments/rules";
import {
  httpMetadata,
  noteAttachments,
  toInfo,
  type AttachmentInfo,
  type AttachmentRow,
} from "./attachment-store.server";
import { noteScope } from "./note-access.server";
import { channelOfNote, notifyNoteRoom, publishChannel } from "./realtime.server";
import { NoteConflictError } from "./note-store.server";
import { assertScope, NoteNotFoundError } from "./notes.server";

export type { AttachmentInfo };

type FilesEnv = { DB: D1Database; FILES: R2Bucket };

/** Kurala uymayan dosya: durum kodu ve arayüzde aynen gösterilecek metin. */
export class AttachmentRejectedError extends Error {
  constructor(
    readonly status: 400 | 409 | 413 | 415,
    readonly code: AttachmentErrorCode | "metin_degil",
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<AttachmentErrorCode, 400 | 409 | 413 | 415> = {
  tur: 415,
  cok_buyuk: 413,
  bos: 400,
  sinir: 409,
};

/** Yüklenen dosya (multipart `File`; R2'ye boyutu bilinen Blob olarak yazılır). */
export type UploadFile = Blob & { name: string };

export function attachmentsService(
  env: FilesEnv,
  userId: string,
  clock: () => Date = () => new Date(),
) {
  const db = createDb(env.DB);

  /** Notun satırı ve alanı; erişim yoksa `NoteNotFoundError`. */
  async function noteFor(noteId: string) {
    const scope = await noteScope(db, userId, noteId);
    const row = await db
      .select({
        id: notes.id,
        kind: notes.kind,
        trashedAt: notes.trashedAt,
        ownerUserId: notes.ownerUserId,
        projectId: notes.projectId,
      })
      .from(notes)
      .where(eq(notes.id, noteId))
      .get();
    /* v8 ignore next */
    if (!row) throw new NoteNotFoundError();
    return { scope, row };
  }

  /** Eki ve notunu çözer; ek yoksa ya da nota erişim yoksa `NoteNotFoundError`. */
  async function attachmentFor(id: string) {
    const att = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!att) throw new NoteNotFoundError();
    const { scope, row } = await noteFor(att.noteId);
    return { att, scope, row };
  }

  async function touch(noteId: string) {
    const now = clock();
    await db.update(notes).set({ updatedBy: userId, updatedAt: now }).where(eq(notes.id, noteId));
  }

  return {
    async list(noteId: string): Promise<AttachmentInfo[]> {
      const { scope } = await noteFor(noteId);
      assertScope(scope, "note.read");
      return (await noteAttachments(db, noteId)).map(toInfo);
    },

    /**
     * Ek yükler: önce yetki ve not durumu, sonra dosya kuralları, sonra R2 ve D1.
     * D1 yazımı başarısız olursa R2 nesnesi silinir.
     */
    async upload(noteId: string, file: UploadFile) {
      const { scope, row } = await noteFor(noteId);
      assertScope(scope, "note.edit");
      if (row.kind !== "text")
        throw new AttachmentRejectedError(409, "metin_degil", MESSAGES.textOnly);
      if (row.trashedAt) throw new NoteConflictError("Çöpteki nota dosya eklenemez");
      const name = sanitizeFileName(file.name);
      const existing = await db
        .select({ n: count() })
        .from(attachments)
        .where(eq(attachments.noteId, noteId))
        .get();
      const check = checkAttachment({ name, size: file.size }, existing?.n ?? 0);
      if (!check.ok)
        throw new AttachmentRejectedError(STATUS[check.code], check.code, check.message);
      const id = crypto.randomUUID();
      const key = r2KeyFor(noteId, id);
      const object = await env.FILES.put(key, file, {
        httpMetadata: httpMetadata(name, check.contentType),
      });
      const now = clock();
      try {
        await db.batch([
          db.insert(attachments).values({
            id,
            noteId,
            r2Key: key,
            name,
            size: object?.size ?? file.size,
            contentType: check.contentType,
            uploadedBy: userId,
            createdAt: now,
            updatedAt: now,
          }),
          db.update(notes).set({ updatedBy: userId, updatedAt: now }).where(eq(notes.id, noteId)),
        ]);
      } catch (error) {
        await env.FILES.delete(key);
        throw error;
      }
      const saved = await db.select().from(attachments).where(eq(attachments.id, id)).get();
      return { attachment: toInfo(saved!), note: row };
    },

    /** Eki kaldırır: D1 satırı ve R2 nesnesi. */
    async remove(id: string) {
      const { att, scope, row } = await attachmentFor(id);
      assertScope(scope, "note.edit");
      if (row.trashedAt) throw new NoteConflictError("Çöpteki notun eki kaldırılamaz");
      await db
        .delete(attachments)
        .where(and(eq(attachments.id, id), eq(attachments.noteId, row.id)));
      await env.FILES.delete(att.r2Key);
      await touch(row.id);
      return { note: row };
    },

    /** İndirme: ek bilgisi ve R2 nesnesi (nesne kayıpsa `NoteNotFoundError`). */
    async open(
      id: string,
      options?: R2GetOptions,
    ): Promise<{ att: AttachmentRow; object: R2ObjectBody | R2Object }> {
      const { att, scope } = await attachmentFor(id);
      assertScope(scope, "note.read");
      const object = await env.FILES.get(att.r2Key, options);
      if (!object) throw new NoteNotFoundError();
      return { att, object };
    },
  };
}

export type AttachmentsService = ReturnType<typeof attachmentsService>;

/** Çapraz site form gönderimine karşı: tarayıcı Origin'i varsa aynı kökten olmalı. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Ek eklendi / kaldırıldı: alan kanalına `icerik` (ızgaradaki kart kapağı yenilenir) ve
 * açık not odasına `not.attachments` (diğer istemciler ek listesini yeniden yükler).
 * Yayın en iyi çabadır; hata günlüğe yazılır.
 */
export async function attachmentChangeEffects(
  env: Pick<Env, "NOTE_ROOM" | "PROJECT_ROOM">,
  userId: string,
  note: { id: string; ownerUserId: string | null; projectId: string | null },
) {
  const channel = channelOfNote(note);
  await Promise.all([
    channel ? publishChannel(env, channel, [{ type: "icerik", noteId: note.id }], userId) : null,
    notifyNoteRoom(env, note.id, { by: userId, meta: { attachments: true } }),
  ]);
}
