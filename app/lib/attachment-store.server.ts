/**
 * Eklerin D1 + R2 yazım yardımcıları (not modüllerine bağımlılığı yok; `copyNote` da
 * kullanır). Yetki denetimi çağıranın işidir (`attachments.server.ts`).
 */
import { asc, eq } from "drizzle-orm";
import type { Database } from "~/db/client";
import { attachments } from "~/db/schema";
import {
  attachmentKind,
  contentDisposition,
  canInline,
  r2KeyFor,
} from "~/domain/attachments/rules";

export type AttachmentRow = typeof attachments.$inferSelect;

/** Arayüze giden ek bilgisi. */
export type AttachmentInfo = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: "image" | "file";
  createdAt: string;
};

export const toInfo = (r: AttachmentRow): AttachmentInfo => ({
  id: r.id,
  name: r.name,
  size: r.size,
  contentType: r.contentType,
  kind: attachmentKind(r.contentType),
  createdAt: r.createdAt.toISOString(),
});

/** Notun ekleri, eklenme sırasıyla. */
export async function noteAttachments(db: Database, noteId: string): Promise<AttachmentRow[]> {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, noteId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
}

/** R2 nesnesinin HTTP üst verisi (doğrudan R2 erişiminde de doğru tür ve ad). */
export const httpMetadata = (name: string, contentType: string): R2HTTPMetadata => ({
  contentType,
  contentDisposition: contentDisposition(name, canInline(contentType) ? "inline" : "attachment"),
});

/**
 * Notun eklerini yeni nota kopyalar ("Kopyasını oluştur", "Kopyala…"): her R2 nesnesi
 * yeni anahtara yazılır, sonra D1 satırları eklenir. R2'de bulunamayan nesne atlanır.
 * D1 yazımı başarısız olursa yazılan kopyalar silinir.
 */
export async function copyAttachments(
  db: Database,
  files: R2Bucket,
  fromNoteId: string,
  toNoteId: string,
  userId: string,
  now: Date,
) {
  const rows = await noteAttachments(db, fromNoteId);
  if (rows.length === 0) return;
  const written: string[] = [];
  const values: (typeof attachments.$inferInsert)[] = [];
  try {
    for (const [i, r] of rows.entries()) {
      const object = await files.get(r.r2Key);
      if (!object) continue;
      const id = crypto.randomUUID();
      const key = r2KeyFor(toNoteId, id);
      await files.put(key, object.body, { httpMetadata: httpMetadata(r.name, r.contentType) });
      written.push(key);
      // Sıra korunsun: aynı milisaniyede eklenenler için artan zaman.
      const at = new Date(now.getTime() + i);
      values.push({
        id,
        noteId: toNoteId,
        r2Key: key,
        name: r.name,
        size: r.size,
        contentType: r.contentType,
        uploadedBy: userId,
        createdAt: at,
        updatedAt: at,
      });
    }
    // D1: sorgu başına en çok 100 parametre; satır başına ayrı ekleme, tek batch.
    const [first, ...rest] = values.map((v) => db.insert(attachments).values(v));
    if (first) await db.batch([first, ...rest]);
  } catch (error) {
    if (written.length) await files.delete(written);
    throw error;
  }
}
