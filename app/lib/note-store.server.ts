/**
 * Not ve görev sunucu modüllerinin ortak D1 yardımcıları: tek batch'te yazım, sürüm
 * penceresi (PLAN §3: aynı kişinin 5 dk içindeki düzenlemeleri tek sürüm, son 50
 * sürüm) ve görev listesi farkının SQL ifadelerine çevrilmesi.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "~/db/client";
import { noteVersions, taskAssignees, tasks } from "~/db/schema";
import type { Task } from "~/domain/tasks/model";
import { diffTasks } from "~/domain/tasks/ops";
import {
  decideCollabVersionWrite,
  decideVersionWrite,
  MAX_VERSIONS,
  versionsToPrune,
} from "~/domain/notes/versions";

export type Batch = BatchItem<"sqlite">[];

/** Not başka bir durumda olduğu için işlem yapılamıyor (rota 409 döner). */
export class NoteConflictError extends Error {}

export async function runBatch(db: Database, ops: Batch) {
  const [first, ...rest] = ops;
  if (first) await db.batch([first, ...rest]);
}

/** Not içeriği değiştiğinde sürüm penceresine göre sürüm yazma adımları. */
export async function versionWriteOps(
  db: Database,
  userId: string,
  noteId: string,
  kind: "text" | "todo",
  title: string,
  snapshot: unknown,
  now: Date,
  forceNew = false,
): Promise<Batch> {
  const existing = await db
    .select({
      id: noteVersions.id,
      authorId: noteVersions.authorId,
      createdAt: noteVersions.createdAt,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id));
  const decision = decideVersionWrite(existing[0] ?? null, userId, now, { forceNew });
  if (decision.action === "update") {
    return [
      db
        .update(noteVersions)
        .set({ kind, title, snapshot, updatedAt: now })
        .where(eq(noteVersions.id, decision.versionId)),
    ];
  }
  const ops: Batch = [
    db.insert(noteVersions).values({
      noteId,
      kind,
      title,
      snapshot,
      authorId: userId,
      createdAt: now,
      updatedAt: now,
    }),
  ];
  const prune = versionsToPrune([...existing, { id: "__new__", createdAt: now }], MAX_VERSIONS);
  if (prune.length) ops.push(db.delete(noteVersions).where(inArray(noteVersions.id, prune)));
  return ops;
}

/**
 * Ortak düzenlemenin (NoteRoom) periyodik yazımında sürüm adımları: `editors` son
 * yazımdan bu yana düzenleyenler (en son düzenleyen sonda); bkz. `decideCollabVersionWrite`.
 */
export async function collabVersionWriteOps(
  db: Database,
  noteId: string,
  kind: "text" | "todo",
  title: string,
  snapshot: unknown,
  editors: readonly string[],
  now: Date,
): Promise<Batch> {
  const existing = await db
    .select({
      id: noteVersions.id,
      authorId: noteVersions.authorId,
      createdAt: noteVersions.createdAt,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id));
  const decision = decideCollabVersionWrite(existing[0] ?? null, editors, now);
  if (decision.action === "none") return [];
  if (decision.action === "update") {
    return [
      db
        .update(noteVersions)
        .set({ kind, title, snapshot, updatedAt: now })
        .where(eq(noteVersions.id, decision.versionId)),
    ];
  }
  const ops: Batch = [
    db.insert(noteVersions).values({
      noteId,
      kind,
      title,
      snapshot,
      authorId: decision.authorId,
      createdAt: now,
      updatedAt: now,
    }),
  ];
  const prune = versionsToPrune([...existing, { id: "__new__", createdAt: now }], MAX_VERSIONS);
  if (prune.length) ops.push(db.delete(noteVersions).where(inArray(noteVersions.id, prune)));
  return ops;
}

type TaskRow = typeof tasks.$inferSelect;

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    parentId: r.parentId,
    position: r.position,
    title: r.title,
    description: r.description ?? "",
    startDate: r.startDate,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    completedAt: r.completedAt ? r.completedAt.getTime() : null,
    completedBy: r.completedBy,
  };
}

const taskColumns = (t: Task) => ({
  parentId: t.parentId,
  position: t.position,
  title: t.title,
  description: t.description || null,
  startDate: t.startDate,
  dueDate: t.dueDate,
  dueTime: t.dueTime,
  completedAt: t.completedAt === null ? null : new Date(t.completedAt),
  completedBy: t.completedBy,
});

/** Notun tüm görevleri (düz liste). */
export async function loadTasks(db: Database, noteId: string): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.noteId, noteId))
    .orderBy(asc(tasks.parentId), asc(tasks.position), asc(tasks.id));
  return rows.map(rowToTask);
}

/**
 * Görev listesinin `before` → `after` farkını yazan ifadeler: önce eklemeler (üst
 * çocuktan önce), sonra güncellemeler, en son silmeler.
 */
export function taskWriteOps(
  db: Database,
  noteId: string,
  before: readonly Task[],
  after: readonly Task[],
  userId: string,
  now: Date,
): Batch {
  const d = diffTasks(before, after);
  const ops: Batch = [];
  for (const t of d.inserted) {
    ops.push(
      db.insert(tasks).values({
        id: t.id,
        noteId,
        ...taskColumns(t),
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  for (const t of d.updated) {
    ops.push(
      db
        .update(tasks)
        .set({ ...taskColumns(t), updatedBy: userId, updatedAt: now })
        .where(and(eq(tasks.id, t.id), eq(tasks.noteId, noteId))),
    );
  }
  for (let i = 0; i < d.deleted.length; i += 50) {
    ops.push(
      db.delete(taskAssignees).where(inArray(taskAssignees.taskId, d.deleted.slice(i, i + 50))),
      db
        .delete(tasks)
        .where(and(eq(tasks.noteId, noteId), inArray(tasks.id, d.deleted.slice(i, i + 50)))),
    );
  }
  return ops;
}
