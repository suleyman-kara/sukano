/**
 * Yapılacaklar notlarının görev işlemleri, alan bazında (kişisel / proje). Alan
 * denetimi `scopedNotes` ile aynıdır: alan dışındaki ya da olmayan not
 * `NoteNotFoundError` (404); proje alanında rol yetmiyorsa `ForbiddenError` (403;
 * görüntüleyici görev işaretleyemez, düzenleyemez). Geçersiz işlem `TaskOpError`,
 * notun durumu uygun değilse `NoteConflictError` (409).
 *
 * `applyOps`: notun görevlerini okur, işlemleri saf `applyTaskOps` ile uygular
 * (tamamlanma zinciri burada yeniden hesaplanır; istemciye güvenilmez), farkı not
 * güncellemesi ve sürüm anlık görüntüsüyle birlikte tek D1 batch'inde yazar. Bir işlem
 * hatalıysa hiçbir şey yazılmaz.
 *
 * Atamalar (`assign` işlemi, yalnızca proje notunda): atanan proje üyesi olmalı;
 * yeni atananlara (kendisi hariç) "göreve atandı" bildirimi yazılır.
 */
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "~/db/client";
import {
  attachments,
  noteVersions,
  notes,
  notifications,
  projectMembers,
  taskAssignees,
  tasks,
  type NoteColor,
  type NoteKind,
} from "~/db/schema";
import type { ProjectAction } from "~/domain/projects/permissions";
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
import {
  assertScope,
  bodyTextOf,
  loadAssignees,
  NoteNotFoundError,
  PERSONAL,
  scopeColumns,
  scopeFilter,
  type NoteScope,
} from "./notes.server";

export { NoteConflictError, TaskOpError };

/** Görev listesi + (proje notunda) atamalar. */
export type TaskState = { tasks: Task[]; assignees: Record<string, string[]> };

export function personalTasks(
  env: { DB: D1Database },
  userId: string,
  clock: () => Date = () => new Date(),
  newId: () => string = () => crypto.randomUUID(),
) {
  return scopedTasks(env, userId, PERSONAL, clock, newId);
}

/** İşlemlerin gerektirdiği eylemler (hepsi düzenleyici ve üstü; görüntüleyici hiçbiri). */
function actionsFor(ops: readonly TaskOp[]): Set<ProjectAction> {
  const out = new Set<ProjectAction>(["note.edit"]);
  for (const op of ops) {
    if (op.op === "complete" || op.op === "uncomplete" || op.op === "reopen") out.add("task.check");
    if (op.op === "assign") out.add("task.assign");
  }
  return out;
}

export function scopedTasks(
  env: { DB: D1Database },
  userId: string,
  scope: NoteScope,
  clock: () => Date = () => new Date(),
  newId: () => string = () => crypto.randomUUID(),
) {
  const db = createDb(env.DB);
  const inScope = scopeFilter(scope, userId);
  const mine = (id: string) => and(eq(notes.id, id), inScope)!;

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

  /**
   * `assign` işlemlerini sırayla uygular; son atama kümesini ve yazma adımlarını döner.
   * Atama yalnızca proje notunda; atanan proje üyesi olmalı.
   */
  async function assignmentWrites(
    noteId: string,
    ops: readonly TaskOp[],
    after: readonly Task[],
    now: Date,
  ) {
    const assignOps = ops.filter((o): o is Extract<TaskOp, { op: "assign" }> => o.op === "assign");
    const current = scope.kind === "project" ? await loadAssignees(db, noteId) : {};
    if (assignOps.length === 0) return { assignees: current, writes: [] as Batch, added: [] };
    if (scope.kind !== "project") throw new TaskOpError("Kişisel notlarda atama yok");
    const members = new Set(
      (
        await db
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(eq(projectMembers.projectId, scope.projectId))
      ).map((m) => m.userId),
    );
    const next: Record<string, string[]> = { ...current };
    for (const op of assignOps) {
      if (op.userIds.some((u) => !members.has(u)))
        throw new TaskOpError("Yalnızca proje üyeleri atanabilir");
      next[op.id] = [...op.userIds];
    }
    const alive = new Set(after.map((t) => t.id));
    const writes: Batch = [];
    const added: { taskId: string; userId: string }[] = [];
    for (const taskId of new Set(assignOps.map((o) => o.id))) {
      if (!alive.has(taskId)) continue;
      const before = new Set(current[taskId] ?? []);
      const want = new Set(next[taskId] ?? []);
      const removed = [...before].filter((u) => !want.has(u));
      if (removed.length)
        writes.push(
          db
            .delete(taskAssignees)
            .where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, removed))),
        );
      for (const u of want) {
        if (before.has(u)) continue;
        writes.push(
          db
            .insert(taskAssignees)
            .values({ taskId, userId: u, assignedBy: userId, createdAt: now }),
        );
        added.push({ taskId, userId: u });
      }
    }
    const assignees: Record<string, string[]> = {};
    for (const [taskId, users] of Object.entries(next)) {
      if (alive.has(taskId) && users.length) assignees[taskId] = users;
    }
    return { assignees, writes, added };
  }

  return {
    /** Notun görevleri, ağaç sırasında (düz liste). */
    async list(noteId: string): Promise<Task[]> {
      return (await this.state(noteId)).tasks;
    },

    /** Görevler + atamalar (proje notunda). */
    async state(noteId: string): Promise<TaskState> {
      assertScope(scope, "note.read");
      const row = await owned(noteId);
      if (row.kind !== "todo") return { tasks: [], assignees: {} };
      return {
        tasks: treeOrder(await loadTasks(db, noteId)),
        assignees: scope.kind === "project" ? await loadAssignees(db, noteId) : {},
      };
    },

    /** Toplu işlem: hepsi uygulanır ya da hiçbiri. Yeni görev listesini döner. */
    async applyOps(noteId: string, ops: readonly TaskOp[]): Promise<Task[]> {
      return (await this.apply(noteId, ops)).tasks;
    },

    /** `applyOps` + son atama durumu. */
    async apply(noteId: string, ops: readonly TaskOp[]): Promise<TaskState> {
      for (const action of actionsFor(ops)) assertScope(scope, action);
      const row = await editableTodo(noteId);
      const now = clock();
      const before = await loadTasks(db, noteId);
      const after = applyTaskOps(before, ops, { now: now.getTime(), userId });
      const known = new Set(before.map((t) => t.id));
      await assertFreeIds(after.filter((t) => !known.has(t.id)).map((t) => t.id));
      const assigned = await assignmentWrites(noteId, ops, after, now);
      const writes = [...taskWriteOps(db, noteId, before, after, userId, now), ...assigned.writes];
      if (writes.length === 0) return { tasks: treeOrder(after), assignees: assigned.assignees };
      const notify = assigned.added.filter((a) => a.userId !== userId);
      await runBatch(db, [
        ...writes,
        db.update(notes).set({ updatedBy: userId, updatedAt: now }).where(mine(noteId)),
        ...(await versionWriteOps(db, userId, noteId, "todo", row.title, todoSnapshot(after), now)),
        ...notify.map((a) =>
          db.insert(notifications).values({
            userId: a.userId,
            type: "goreve_atandi",
            projectId: row.projectId,
            noteId,
            actorId: userId,
            data: {
              taskId: a.taskId,
              taskTitle: after.find((t) => t.id === a.taskId)?.title ?? "",
              noteTitle: row.title,
            },
            createdAt: now,
            updatedAt: now,
          }),
        ),
      ]);
      return { tasks: treeOrder(after), assignees: assigned.assignees };
    },

    /** Yapılacaklar notu oluşturur (en üste); isteğe bağlı üst seviye görevlerle. */
    async createTodo(input: {
      id: string;
      title: string;
      color: NoteColor;
      pinned: boolean;
      tasks: string[];
    }) {
      assertScope(scope, "note.create");
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
        .where(and(inScope, isNull(notes.trashedAt), isNull(notes.archivedAt)));
      const lines = input.tasks
        .map((t) => ({ title: t.trim(), done: false }))
        .filter((l) => l.title);
      const created = linesToTasks(lines, newId, now.getTime(), userId);
      const ops: Batch = [
        db.insert(notes).values({
          id: input.id,
          kind: "todo",
          ...scopeColumns(scope, userId),
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
      assertScope(scope, "note.edit");
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
export type ScopedTasks = ReturnType<typeof scopedTasks>;
