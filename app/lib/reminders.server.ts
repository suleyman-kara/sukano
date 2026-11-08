/**
 * Hatırlatıcılar (PLAN §3, §5): not düzeyi (tarih + saat) ve görev ("Hatırlat": bitiş
 * tarihi + saat, saat yoksa 09:00). Saat kuranın saat diliminde yorumlanır, `reminders.at`
 * UTC ms olarak saklanır. Bir kez çalar; erteleme ve tekrar yok.
 *
 * - Kurma / kaldırma: notu düzenleyebilen (kişisel notta sahibi, projede yönetici ve
 *   düzenleyici). Hedef başına tek hatırlatıcı (`reminders_target_unique`).
 * - Görevin bitiş tarihi ya da saati değişince hatırlatıcı yeniden hesaplanır
 *   (`taskReminderSyncOps`, görev yazımıyla aynı batch'te); tarih kalkarsa ya da görev
 *   silinirse hatırlatıcı da silinir.
 * - Cron (`dispatchDueReminders`): zamanı gelenler tek koşullu UPDATE … RETURNING ile
 *   **tam bir kez** alınır, alıcılara `hatirlatici` bildirimi yazılır, ardından dağıtılır.
 */
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { createDb, type Database } from "~/db/client";
import {
  notes,
  notifications,
  projectMembers,
  projects,
  reminders,
  taskAssignees,
  tasks,
} from "~/db/schema";
import { reminderRecipients, shouldSkipReminder } from "~/domain/reminders/recipients";
import { resolveTimeZone, taskReminderAt, zonedToUtc } from "~/domain/reminders/time";
import type { Task } from "~/domain/tasks/model";
import { NoteConflictError, runBatch, type Batch } from "./note-store.server";
import { noteScope } from "./note-access.server";
import { assertScope } from "./notes.server";
import {
  deliverPendingNotifications,
  settingsFromDb,
  setTimeZone,
  userSettings,
} from "./notifications.server";

type DbEnv = { DB: D1Database };

/** Notun gönderilmemiş hatırlatıcıları: not düzeyi ve görev kimliği → an (ms). */
export type NoteReminders = { note: number | null; tasks: Record<string, number> };

/** Bir dağıtım turunda en çok alınan hatırlatıcı. */
export const DISPATCH_BATCH = 200;

export async function noteReminders(env: DbEnv, noteId: string): Promise<NoteReminders> {
  const rows = await createDb(env.DB)
    .select({ targetType: reminders.targetType, targetId: reminders.targetId, at: reminders.at })
    .from(reminders)
    .where(and(eq(reminders.noteId, noteId), isNull(reminders.sentAt)));
  const out: NoteReminders = { note: null, tasks: {} };
  for (const r of rows) {
    if (r.targetType === "note") out.note = r.at.getTime();
    else out.tasks[r.targetId] = r.at.getTime();
  }
  return out;
}

/** Notu düzenleyebilir mi; not satırı (çöpteyse 409). */
async function editableNote(db: Database, userId: string, noteId: string) {
  const scope = await noteScope(db, userId, noteId);
  assertScope(scope, "note.edit");
  const row = await db
    .select({ kind: notes.kind, trashedAt: notes.trashedAt })
    .from(notes)
    .where(eq(notes.id, noteId))
    .get();
  if (!row) throw new NoteConflictError("Not bulunamadı");
  if (row.trashedAt) throw new NoteConflictError("Çöpteki nota hatırlatıcı kurulamaz");
  return row;
}

/** İstekteki saat dilimi geçerliyse onu saklayıp kullanır; değilse kayıtlı olanı. */
async function zoneFor(env: DbEnv, userId: string, requested?: string | null) {
  if (requested) return setTimeZone(env, userId, requested);
  return (await userSettings(env, userId)).timeZone;
}

async function upsert(
  db: Database,
  input: {
    targetType: "note" | "task";
    targetId: string;
    noteId: string;
    at: Date;
    userId: string;
  },
) {
  const now = new Date();
  await db
    .insert(reminders)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      noteId: input.noteId,
      at: input.at,
      createdBy: input.userId,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reminders.targetType, reminders.targetId],
      set: {
        at: input.at,
        noteId: input.noteId,
        createdBy: input.userId,
        sentAt: null,
        updatedAt: now,
      },
    });
}

/** Not hatırlatıcısını kurar ya da değiştirir. Dönen: an (ms). */
export async function setNoteReminder(
  env: DbEnv,
  userId: string,
  input: { noteId: string; date: string; time: string; timeZone?: string | null },
): Promise<number> {
  const db = createDb(env.DB);
  await editableNote(db, userId, input.noteId);
  const tz = await zoneFor(env, userId, input.timeZone);
  const at = zonedToUtc(input.date, input.time, tz);
  await upsert(db, {
    targetType: "note",
    targetId: input.noteId,
    noteId: input.noteId,
    at: new Date(at),
    userId,
  });
  return at;
}

export async function clearNoteReminder(env: DbEnv, userId: string, noteId: string) {
  const db = createDb(env.DB);
  await editableNote(db, userId, noteId);
  await db
    .delete(reminders)
    .where(and(eq(reminders.targetType, "note"), eq(reminders.targetId, noteId)));
}

/**
 * Görevin "Hatırlat" anahtarı. Açıkken bitiş tarihi zorunludur (409); an bitiş tarihi +
 * saat (yoksa 09:00). Dönen: an (ms) ya da kapatıldıysa null.
 */
export async function setTaskReminder(
  env: DbEnv,
  userId: string,
  input: { noteId: string; taskId: string; on: boolean; timeZone?: string | null },
): Promise<number | null> {
  const db = createDb(env.DB);
  const note = await editableNote(db, userId, input.noteId);
  if (note.kind !== "todo") throw new NoteConflictError("Görev bulunamadı");
  const task = await db
    .select({ dueDate: tasks.dueDate, dueTime: tasks.dueTime })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.noteId, input.noteId)))
    .get();
  if (!task) throw new NoteConflictError("Görev bulunamadı");
  if (!input.on) {
    await db
      .delete(reminders)
      .where(and(eq(reminders.targetType, "task"), eq(reminders.targetId, input.taskId)));
    return null;
  }
  const tz = await zoneFor(env, userId, input.timeZone);
  const at = taskReminderAt(task.dueDate, task.dueTime, tz);
  if (at === null) throw new NoteConflictError("Hatırlatmak için önce bitiş tarihi ver");
  await upsert(db, {
    targetType: "task",
    targetId: input.taskId,
    noteId: input.noteId,
    at: new Date(at),
    userId,
  });
  return at;
}

/**
 * Görev yazımında hatırlatıcıların güncellenmesi (aynı batch'e eklenir): bitiş tarihi /
 * saati değişen görevin hatırlatıcısı kuranın saat diliminde yeniden hesaplanır ve
 * yeniden kurulur; tarihi kalkan ya da silinen görevin hatırlatıcısı silinir.
 */
export async function taskReminderSyncOps(
  db: Database,
  noteId: string,
  before: readonly Task[],
  after: readonly Task[],
  now: Date,
): Promise<Batch> {
  const rows = await db
    .select({
      id: reminders.id,
      targetId: reminders.targetId,
      at: reminders.at,
      createdBy: reminders.createdBy,
    })
    .from(reminders)
    .where(and(eq(reminders.noteId, noteId), eq(reminders.targetType, "task")));
  if (rows.length === 0) return [];
  const prev = new Map(before.map((t) => [t.id, t]));
  const next = new Map(after.map((t) => [t.id, t]));
  const changed = rows.filter((r) => {
    const a = prev.get(r.targetId);
    const b = next.get(r.targetId);
    return !b || !b.dueDate || a?.dueDate !== b.dueDate || a?.dueTime !== b.dueTime;
  });
  if (changed.length === 0) return [];
  const zones = await settingsFromDb(
    db,
    changed.flatMap((r) => (r.createdBy ? [r.createdBy] : [])),
  );
  const ops: Batch = [];
  for (const r of changed) {
    const t = next.get(r.targetId);
    const tz = resolveTimeZone(r.createdBy ? zones.get(r.createdBy)?.timeZone : null);
    const at = t ? taskReminderAt(t.dueDate, t.dueTime, tz) : null;
    if (at === null) ops.push(db.delete(reminders).where(eq(reminders.id, r.id)));
    else if (at !== r.at.getTime())
      ops.push(
        db
          .update(reminders)
          .set({ at: new Date(at), sentAt: null, updatedAt: now })
          .where(eq(reminders.id, r.id)),
      );
  }
  return ops;
}

/* ------------------------------------------------------------------ */
/* Cron                                                                */
/* ------------------------------------------------------------------ */

export type DispatchResult = { claimed: number; notified: number; skipped: number };

/**
 * Zamanı gelmiş (at ≤ now), gönderilmemiş hatırlatıcıları tam bir kez alır ve alıcılara
 * bildirim yazar. İki cron aynı anda koşsa da bir hatırlatıcıyı yalnızca biri alır
 * (`sent_at IS NULL` koşullu UPDATE … RETURNING).
 */
export async function dispatchDueReminders(env: DbEnv, now: Date): Promise<DispatchResult> {
  const db = createDb(env.DB);
  const claimed = await db
    .update(reminders)
    .set({ sentAt: now, updatedAt: now })
    .where(
      and(
        isNull(reminders.sentAt),
        inArray(
          reminders.id,
          db
            .select({ id: reminders.id })
            .from(reminders)
            .where(and(isNull(reminders.sentAt), lte(reminders.at, now)))
            .orderBy(reminders.at)
            .limit(DISPATCH_BATCH),
        ),
      ),
    )
    .returning();
  const result: DispatchResult = { claimed: claimed.length, notified: 0, skipped: 0 };
  if (claimed.length === 0) return result;

  const noteIds = [...new Set(claimed.map((r) => r.noteId))];
  const noteRows = await db
    .select({
      id: notes.id,
      title: notes.title,
      ownerUserId: notes.ownerUserId,
      projectId: notes.projectId,
      trashedAt: notes.trashedAt,
      projectDeletedAt: projects.deletedAt,
      projectName: projects.name,
    })
    .from(notes)
    .leftJoin(projects, eq(projects.id, notes.projectId))
    .where(inArray(notes.id, noteIds));
  const noteById = new Map(noteRows.map((n) => [n.id, n]));
  const projectIds = [...new Set(noteRows.flatMap((n) => (n.projectId ? [n.projectId] : [])))];
  const members = projectIds.length
    ? await db
        .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
        .from(projectMembers)
        .where(inArray(projectMembers.projectId, projectIds))
    : [];
  const taskIds = claimed.filter((r) => r.targetType === "task").map((r) => r.targetId);
  const taskRows = taskIds.length
    ? await db
        .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
        .from(tasks)
        .where(inArray(tasks.id, taskIds))
    : [];
  const taskById = new Map(taskRows.map((t) => [t.id, t]));
  const assignRows = taskIds.length
    ? await db
        .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(inArray(taskAssignees.taskId, taskIds))
    : [];

  const inserts: Batch = [];
  for (const r of claimed) {
    const note = noteById.get(r.noteId);
    const task = r.targetType === "task" ? taskById.get(r.targetId) : undefined;
    if (
      !note ||
      shouldSkipReminder({
        target: r.targetType,
        noteTrashed: note.trashedAt !== null,
        projectDeleted: note.projectDeletedAt != null,
        taskExists: task !== undefined,
        taskDone: task?.completedAt != null,
      })
    ) {
      result.skipped++;
      continue;
    }
    const recipients = reminderRecipients({
      target: r.targetType,
      ownerUserId: note.ownerUserId,
      projectMemberIds: members.filter((m) => m.projectId === note.projectId).map((m) => m.userId),
      assigneeIds: assignRows.filter((a) => a.taskId === r.targetId).map((a) => a.userId),
      setterId: r.createdBy,
    });
    for (const userId of recipients) {
      inserts.push(
        db.insert(notifications).values({
          userId,
          type: "hatirlatici",
          projectId: note.projectId,
          noteId: note.id,
          actorId: null,
          data: {
            targetType: r.targetType,
            reminderId: r.id,
            noteTitle: note.title,
            ...(task ? { taskId: r.targetId, taskTitle: task.title } : {}),
            at: r.at.getTime(),
          },
          createdAt: now,
          updatedAt: now,
        }),
      );
      result.notified++;
    }
  }
  if (inserts.length) await runBatch(db, inserts);
  return result;
}

/** Cron işi: hatırlatıcıları gönderir, sonra bekleyen bildirimleri (push + canlı) dağıtır. */
export async function runReminderJob(
  env: DbEnv & Parameters<typeof deliverPendingNotifications>[0],
  now: Date,
  fetchImpl?: typeof fetch,
) {
  const dispatched = await dispatchDueReminders(env, now);
  const delivered = await deliverPendingNotifications(env, now, fetchImpl);
  return { ...dispatched, ...delivered };
}
