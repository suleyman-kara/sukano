/**
 * Kişisel yapılacaklar notlarının görev işlemleri (Aşama 2). Sahiplik denetimi
 * `personalNotes` ile aynıdır: başka kullanıcının notu ya da olmayan not
 * `NoteNotFoundError` (404). Geçersiz işlem `TaskOpError`, notun durumu uygun değilse
 * `NoteConflictError` (409).
 *
 * `applyOps`: notun görevlerini okur, işlemleri saf `applyTaskOps` ile uygular
 * (tamamlanma zinciri burada yeniden hesaplanır; istemciye güvenilmez), farkı not
 * güncellemesi ve sürüm anlık görüntüsüyle birlikte tek D1 batch'inde yazar. Bir işlem
 * hatalıysa hiçbir şey yazılmaz.
 *
 * Proje notları ve atamalar (`task_assignees`) Aşama 3'te: `ops` biçimi o zaman
 * `assign` / `unassign` işlemleriyle genişletilecek.
 */
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "~/db/client";
import {
  attachments,
  noteVersions,
  notes,
  tasks,
  type NoteColor,
  type NoteKind,
} from "~/db/schema";
import { htmlToText } from "~/domain/notes/html";
import { topPosition } from "~/domain/notes/ordering";
import type { NoteIntent } from "~/domain/notes/validation";
import {
  canConvertToTodo,
  linesToTasks,
  tasksToHtml,
  textToTaskLines,
  todoSnapshot,
} from "~/domain/tasks/convert";
import { treeOrder, type Task } from "~/domain/tasks/model";
import { applyTaskOps, TaskOpError, type TaskOp } from "~/domain/tasks/ops";
import {
  loadTasks,
  NoteConflictError,
  runBatch,
  taskWriteOps,
  versionWriteOps,
  type Batch,
} from "./note-store.server";
import { bodyTextOf, NoteNotFoundError } from "./notes.server";

export { NoteConflictError, TaskOpError };

export function personalTasks(
  env: { DB: D1Database },
  userId: string,
  clock: () => Date = () => new Date(),
  newId: () => string = () => crypto.randomUUID(),
) {
  const db = createDb(env.DB);
  const mine = (id: string) => and(eq(notes.id, id), eq(notes.ownerUserId, userId))!;

  async function owned(id: string) {
    const row = await db.select().from(notes).where(mine(id)).get();
    if (!row) throw new NoteNotFoundError();
    return row;
  }

  async function editableTodo(id: string) {
    const row = await owned(id);
    if (row.kind !== "todo") throw new NoteConflictError("Not yapılacaklar notu değil");
    if (row.trashedAt) throw new NoteConflictError("Çöpteki not düzenlenemez");
    return row;
  }

  /** Yeni görev kimliği başka bir notta kullanılıyorsa (çakışma) reddedilir. */
  async function assertFreeIds(ids: string[]) {
    for (let i = 0; i < ids.length; i += 50) {
      const taken = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(inArray(tasks.id, ids.slice(i, i + 50)))
        .get();
      if (taken) throw new TaskOpError("Görev zaten var");
    }
  }

  return {
    /** Notun görevleri, ağaç sırasında (düz liste). */
    async list(noteId: string): Promise<Task[]> {
      const row = await owned(noteId);
      return row.kind === "todo" ? treeOrder(await loadTasks(db, noteId)) : [];
    },

    /** Toplu işlem: hepsi uygulanır ya da hiçbiri. Yeni görev listesini döner. */
    async applyOps(noteId: string, ops: readonly TaskOp[]): Promise<Task[]> {
      const row = await editableTodo(noteId);
      const now = clock();
      const before = await loadTasks(db, noteId);
      const after = applyTaskOps(before, ops, { now: now.getTime(), userId });
      const known = new Set(before.map((t) => t.id));
      await assertFreeIds(after.filter((t) => !known.has(t.id)).map((t) => t.id));
      const writes = taskWriteOps(db, noteId, before, after, userId, now);
      if (writes.length === 0) return treeOrder(after);
      await runBatch(db, [
        ...writes,
        db.update(notes).set({ updatedBy: userId, updatedAt: now }).where(mine(noteId)),
        ...(await versionWriteOps(db, userId, noteId, "todo", row.title, todoSnapshot(after), now)),
      ]);
      return treeOrder(after);
    },

    /** Yapılacaklar notu oluşturur (en üste); isteğe bağlı üst seviye görevlerle. */
    async createTodo(input: {
      id: string;
      title: string;
      color: NoteColor;
      pinned: boolean;
      tasks: string[];
    }) {
      const now = clock();
      const exists = await db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.id, input.id))
        .get();
      if (exists) throw new NoteNotFoundError();
      const positions = await db
        .select({ position: notes.position })
        .from(notes)
        .where(
          and(eq(notes.ownerUserId, userId), isNull(notes.trashedAt), isNull(notes.archivedAt)),
        );
      const lines = input.tasks
        .map((t) => ({ title: t.trim(), done: false }))
        .filter((l) => l.title);
      const created = linesToTasks(lines, newId, now.getTime(), userId);
      const ops: Batch = [
        db.insert(notes).values({
          id: input.id,
          kind: "todo",
          ownerUserId: userId,
          title: input.title,
          color: input.color,
          pinned: input.pinned,
          position: topPosition(positions.map((p) => p.position)),
          createdBy: userId,
          updatedBy: userId,
          bodyText: bodyTextOf(input.title, ""),
          createdAt: now,
          updatedAt: now,
        }),
        ...taskWriteOps(db, input.id, [], created, userId, now),
      ];
      if (input.title.trim() || created.length) {
        ops.push(
          db.insert(noteVersions).values({
            noteId: input.id,
            kind: "todo",
            title: input.title,
            snapshot: todoSnapshot(created),
            authorId: userId,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      await runBatch(db, ops);
    },

    /**
     * Metin ↔ yapılacaklar. Metnin satırları üst seviye görev olur; görevler girintisi
     * korunarak madde listesine döner. Eki olan metin notu dönüştürülemez.
     * Dönüşüm her zaman yeni bir sürüm olarak kaydedilir.
     */
    async convert(noteId: string, to: NoteKind) {
      const row = await owned(noteId);
      if (row.kind === to) return;
      if (row.trashedAt) throw new NoteConflictError("Çöpteki not düzenlenemez");
      const now = clock();
      const ops: Batch = [];
      if (to === "todo") {
        const n = await db
          .select({ n: count() })
          .from(attachments)
          .where(eq(attachments.noteId, noteId))
          .get();
        const check = canConvertToTodo(n?.n ?? 0);
        if (!check.ok) throw new NoteConflictError(check.error);
        const created = linesToTasks(textToTaskLines(row.bodyHtml), newId, now.getTime(), userId);
        await assertFreeIds(created.map((t) => t.id));
        ops.push(
          db
            .update(notes)
            .set({
              kind: "todo",
              bodyHtml: null,
              bodyJson: null,
              bodyText: bodyTextOf(row.title, ""),
              updatedBy: userId,
              updatedAt: now,
            })
            .where(mine(noteId)),
          ...taskWriteOps(db, noteId, [], created, userId, now),
          ...(await versionWriteOps(
            db,
            userId,
            noteId,
            "todo",
            row.title,
            todoSnapshot(created),
            now,
            true,
          )),
        );
      } else {
        const current = await loadTasks(db, noteId);
        const html = tasksToHtml(current);
        ops.push(
          db
            .update(notes)
            .set({
              kind: "text",
              bodyHtml: html,
              bodyJson: null,
              bodyText: bodyTextOf(row.title, html),
              updatedBy: userId,
              updatedAt: now,
            })
            .where(mine(noteId)),
          ...taskWriteOps(db, noteId, current, [], userId, now),
          ...(await versionWriteOps(
            db,
            userId,
            noteId,
            "text",
            row.title,
            { html, text: htmlToText(html) },
            now,
            true,
          )),
        );
      }
      await runBatch(db, ops);
    },

    /** `/api/notlar` form eylemleri: `create-todo`, `convert`. */
    async run(intent: Extract<NoteIntent, { intent: "create-todo" | "convert" }>) {
      if (intent.intent === "create-todo") return this.createTodo(intent);
      return this.convert(intent.id, intent.to);
    },
  };
}

export type PersonalTasks = ReturnType<typeof personalTasks>;
