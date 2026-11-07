/**
 * Not erişimi: bir notun ya da projenin alanını (kişisel / proje + rol) çözer ve
 * `/api/notlar` eylemlerini doğru alanda çalıştırır. Taşıma ("Taşı veya kopyala…")
 * ve kopyalama ("Kopyala…") iki alan arasında çalıştığı için buradadır.
 *
 * Kurallar (PLAN §2):
 * - Kişisel not projeye taşınabilir (hedefte yönetici/düzenleyici); 10 sn içinde geri
 *   alınabilir, sonra kesinleşir.
 * - Proje notu taşınamaz, yalnızca kopyalanır (kaynakta düzenleyici ve üstü).
 * - Kopya hedefte yeni not olarak, en üste oluşur; sürüm geçmişi kopyalanmaz.
 */
import { and, eq, isNull } from "drizzle-orm";
import { createDb, type Database } from "~/db/client";
import { notes, type NoteMoveOrigin } from "~/db/schema";
import { topPosition } from "~/domain/notes/ordering";
import type { NoteIntent } from "~/domain/notes/validation";
import { canUndoMove } from "~/domain/projects/lifecycle";
import { NoteConflictError, runBatch } from "./note-store.server";
import {
  assertScope,
  copyNote,
  NoteNotFoundError,
  PERSONAL,
  scopedNotes,
  type NoteScope,
} from "./notes.server";
import { memberRole, ProjectNotFoundError } from "./project-access.server";
import { scopedTasks } from "./tasks.server";

type Env = { DB: D1Database; FILES?: R2Bucket };

/** Proje alanı; üye değilse ya da proje silinmişse `ProjectNotFoundError`. */
export async function projectScope(
  db: Database,
  userId: string,
  projectId: string,
): Promise<NoteScope> {
  const { role } = await memberRole(db, userId, projectId);
  return { kind: "project", projectId, role };
}

/**
 * Notun alanı: kendi kişisel notu ya da üyesi olduğu (silinmemiş) projenin notu.
 * Diğer her durumda `NoteNotFoundError` (varlığı sızmaz).
 */
export async function noteScope(db: Database, userId: string, noteId: string): Promise<NoteScope> {
  const row = await db
    .select({ ownerUserId: notes.ownerUserId, projectId: notes.projectId })
    .from(notes)
    .where(eq(notes.id, noteId))
    .get();
  if (!row) throw new NoteNotFoundError();
  if (row.ownerUserId === userId) return PERSONAL;
  if (!row.projectId) throw new NoteNotFoundError();
  try {
    return await projectScope(db, userId, row.projectId);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) throw new NoteNotFoundError();
    /* v8 ignore next */
    throw error;
  }
}

/** Oturumdaki kullanıcının not erişimi. */
export function noteAccess(env: Env, userId: string, clock: () => Date = () => new Date()) {
  const db = createDb(env.DB);

  const notesIn = (scope: NoteScope) => scopedNotes(env, userId, scope, clock);
  const tasksIn = (scope: NoteScope) => scopedTasks(env, userId, scope, clock);

  return {
    /** Notun alanı ve o alandaki servisler (loader'lar: `/not/:id`, proje notu). */
    async forNote(noteId: string) {
      const scope = await noteScope(db, userId, noteId);
      return { scope, notes: notesIn(scope), tasks: tasksIn(scope) };
    },

    /** Proje alanı ve servisleri; üye değilse `ProjectNotFoundError`. */
    async forProject(projectId: string) {
      const scope = await projectScope(db, userId, projectId);
      return { scope, notes: notesIn(scope), tasks: tasksIn(scope) };
    },

    /**
     * Kişisel notu projeye taşır. Not projenin olur ve kişisel alandan kalkar; en
     * üste eklenir, arşivden çıkar. Geri alma bilgisi `move_origin`'de tutulur.
     */
    async moveToProject(noteId: string, projectId: string) {
      const target = await projectScope(db, userId, projectId);
      assertScope(target, "note.moveIn");
      const row = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.ownerUserId, userId)))
        .get();
      if (!row) {
        // Proje notu taşınamaz, yalnızca kopyalanır.
        const scope = await noteScope(db, userId, noteId);
        if (scope.kind === "project")
          throw new NoteConflictError("Proje notu taşınamaz, yalnızca kopyalanır.");
        /* v8 ignore next */
        throw new NoteNotFoundError();
      }
      if (row.trashedAt) throw new NoteConflictError("Çöpteki not taşınamaz");
      const now = clock();
      const positions = await db
        .select({ position: notes.position })
        .from(notes)
        .where(
          and(eq(notes.projectId, projectId), isNull(notes.trashedAt), isNull(notes.archivedAt)),
        );
      const origin: NoteMoveOrigin = {
        userId,
        at: now.getTime(),
        position: row.position,
        pinned: row.pinned,
        archivedAt: row.archivedAt?.getTime() ?? null,
      };
      await db
        .update(notes)
        .set({
          ownerUserId: null,
          projectId,
          position: topPosition(positions.map((p) => p.position)),
          archivedAt: null,
          moveOrigin: origin,
          updatedBy: userId,
          updatedAt: now,
        })
        .where(eq(notes.id, noteId));
    },

    /**
     * Taşımayı geri alır (toast "Geri al"): yalnızca taşıyan kişi, yalnızca pencere
     * içinde; not eski konumuyla kişisel alana döner. Pencere geçtiyse 409.
     */
    async undoMove(noteId: string) {
      const row = await db.select().from(notes).where(eq(notes.id, noteId)).get();
      const origin = row?.moveOrigin;
      if (!row || !row.projectId || !origin || origin.userId !== userId)
        throw new NoteNotFoundError();
      if (!canUndoMove(new Date(origin.at), clock()))
        throw new NoteConflictError("Taşıma kesinleşti; artık geri alınamaz.");
      await runBatch(db, [
        db
          .update(notes)
          .set({
            ownerUserId: userId,
            projectId: null,
            position: origin.position,
            pinned: origin.pinned,
            archivedAt: origin.archivedAt === null ? null : new Date(origin.archivedAt),
            trashedAt: null,
            moveOrigin: null,
          })
          .where(eq(notes.id, noteId)),
      ]);
    },

    /**
     * Notu başka alana kopyalar (`projectId` null → kişisel alan). Kaynak proje notuysa
     * düzenleyici ve üstü gerekir; hedef projede de düzenleyici ve üstü.
     */
    async copyTo(noteId: string, newId: string, projectId: string | null) {
      const source = await noteScope(db, userId, noteId);
      assertScope(source, "note.copyOut");
      const target = projectId ? await projectScope(db, userId, projectId) : PERSONAL;
      assertScope(target, "note.moveIn");
      const row = await db.select().from(notes).where(eq(notes.id, noteId)).get();
      /* v8 ignore next */
      if (!row) throw new NoteNotFoundError();
      await copyNote(db, row, newId, target, userId, clock());
    },

    /** `/api/notlar` form eylemi: alanı çözer, yetkiyi denetler, çalıştırır. */
    async run(intent: NoteIntent): Promise<{ deleted?: number; id?: string } | void> {
      switch (intent.intent) {
        case "move-to-project":
          return this.moveToProject(intent.id, intent.projectId);
        case "undo-move":
          return this.undoMove(intent.id);
        case "copy-to":
          await this.copyTo(intent.id, intent.newId, intent.projectId);
          return { id: intent.newId };
        case "create":
        case "create-todo":
        case "empty-trash": {
          const scope = intent.projectId
            ? await projectScope(db, userId, intent.projectId)
            : PERSONAL;
          if (intent.intent === "create-todo") return tasksIn(scope).run(intent);
          return notesIn(scope).run(intent);
        }
        case "convert":
          return tasksIn(await noteScope(db, userId, intent.id)).run(intent);
        default:
          return notesIn(await noteScope(db, userId, intent.id)).run(intent);
      }
    },
  };
}

export type NoteAccess = ReturnType<typeof noteAccess>;
