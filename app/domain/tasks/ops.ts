/**
 * Görev işlemleri: istemcinin `POST /api/notlar/:id/gorevler` ile gönderdiği toplu
 * işlem listesi. Aynı kod iki yerde çalışır:
 * - istemci: ağaç işlemleri (`tree.ts`) işlemi üretir ve yerel listeye uygular;
 * - sunucu: listeyi doğrular (`parseTaskOps`), veritabanındaki görevlere uygular
 *   (`applyTaskOps`), farkı (`diffTasks`) tek D1 batch'inde yazar.
 *
 * Tamamlanma zinciri her zaman burada yeniden hesaplanır; istemci yalnızca hangi
 * görevin işaretlendiğini söyler. Bir işlem geçersizse {@link TaskOpError} fırlatılır
 * ve hiçbir işlem uygulanmaz.
 */
import { completeTask, reopenTasks, uncompleteTask, clearCompleted } from "./completion";
import { fixRange, isValidDate, isValidTime } from "./dates";
import {
  ancestorsOf,
  depthOf,
  findTask,
  isDescendant,
  isDone,
  makeTask,
  subtreeIds,
  type Task,
  type TaskFields,
} from "./model";

export const MAX_OPS = 500;
export const MAX_TASKS = 2000;
export const MAX_TASK_TITLE_LENGTH = 1000;
export const MAX_TASK_DESCRIPTION_LENGTH = 50_000;

type DateFields = Partial<Pick<Task, "startDate" | "dueDate" | "dueTime">>;

export type CreateOp = {
  op: "create";
  id: string;
  parentId: string | null;
  position: number;
  title?: string;
  description?: string;
  /** true: tamamlanmış olarak ekle (ör. "Tamamlananları sil" geri alınırken). */
  completed?: boolean;
} & DateFields;

export type UpdateOp = {
  op: "update";
  id: string;
  title?: string;
  description?: string;
} & DateFields;

export type TaskOp =
  | CreateOp
  | UpdateOp
  /** Girinti, çıkarma, kardeşler arası taşıma ve sürükle-bırak sonucu. */
  | { op: "move"; id: string; parentId: string | null; position: number }
  | { op: "complete"; id: string }
  | { op: "uncomplete"; id: string }
  /** Tamamlamayı geri al: tam olarak bu görevleri aç (+ tamamlanmış üstleri). */
  | { op: "reopen"; ids: string[] }
  | { op: "delete"; id: string; withSubtree?: boolean }
  | { op: "clearCompleted" };

export type OpContext = { now: number; userId: string };

export class TaskOpError extends Error {}

/* ------------------------------------------------------------------ */
/* Doğrulama                                                           */
/* ------------------------------------------------------------------ */

/** Var olan görev kimlikleri: UUID ya da tohum verisindeki kısa çizgili adlar. */
const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Yeni görev kimliğini istemci üretir; UUID olmalı. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isTaskId = (v: unknown): v is string => typeof v === "string" && TASK_ID.test(v);

export type ParseOpsResult = { ok: true; value: TaskOp[] } | { ok: false; error: string };

class ParseError extends Error {}
const bad = (message: string): never => {
  throw new ParseError(message);
};

type Raw = Record<string, unknown>;

const has = (o: Raw, k: string) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function parent(o: Raw): string | null {
  if (!has(o, "parentId")) return bad("Geçersiz üst görev");
  if (o.parentId === null) return null;
  return isTaskId(o.parentId) ? o.parentId : bad("Geçersiz üst görev");
}

function position(o: Raw): number {
  return typeof o.position === "number" && Number.isFinite(o.position)
    ? o.position
    : bad("Geçersiz sıra");
}

/** İsteğe bağlı metin ve tarih alanları; yalnızca gönderilenler döner. */
function fields(o: Raw): Partial<TaskFields> {
  const out: Partial<TaskFields> = {};
  if (has(o, "title")) {
    if (typeof o.title !== "string" || o.title.length > MAX_TASK_TITLE_LENGTH)
      bad("Başlık çok uzun");
    out.title = o.title as string;
  }
  if (has(o, "description")) {
    if (typeof o.description !== "string" || o.description.length > MAX_TASK_DESCRIPTION_LENGTH)
      bad("Açıklama geçersiz");
    out.description = o.description as string;
  }
  for (const k of ["startDate", "dueDate"] as const) {
    if (has(o, k)) {
      if (o[k] !== null && !isValidDate(o[k])) bad("Geçersiz tarih");
      out[k] = o[k] as string | null;
    }
  }
  if (has(o, "dueTime")) {
    if (o.dueTime !== null && !isValidTime(o.dueTime)) bad("Geçersiz saat");
    out.dueTime = o.dueTime as string | null;
  }
  return out;
}

function parseOne(raw: unknown): TaskOp {
  if (typeof raw !== "object" || raw === null) return bad("Bilinmeyen işlem");
  const o = raw as Raw;
  const id = () => (isTaskId(o.id) ? o.id : bad("Geçersiz görev kimliği"));
  switch (o.op) {
    case "create": {
      if (typeof o.id !== "string" || !UUID.test(o.id)) bad("Geçersiz görev kimliği");
      const op: CreateOp = {
        op: "create",
        id: o.id as string,
        parentId: parent(o),
        position: position(o),
        ...fields(o),
      };
      if (has(o, "completed")) {
        if (typeof o.completed !== "boolean") bad("Geçersiz tamamlanma");
        op.completed = o.completed as boolean;
      }
      return op;
    }
    case "update": {
      const op: UpdateOp = { op: "update", id: id(), ...fields(o) };
      if (Object.keys(op).length === 2) bad("Değişiklik yok");
      return op;
    }
    case "move":
      return { op: "move", id: id(), parentId: parent(o), position: position(o) };
    case "complete":
    case "uncomplete":
      return { op: o.op, id: id() };
    case "reopen": {
      if (
        !Array.isArray(o.ids) ||
        o.ids.length === 0 ||
        o.ids.length > MAX_TASKS ||
        !o.ids.every(isTaskId)
      )
        bad("Geçersiz görev kimliği");
      return { op: "reopen", ids: [...(o.ids as string[])] };
    }
    case "delete": {
      const op: TaskOp = { op: "delete", id: id() };
      if (has(o, "withSubtree")) {
        if (typeof o.withSubtree !== "boolean") bad("Geçersiz silme");
        op.withSubtree = o.withSubtree as boolean;
      }
      return op;
    }
    case "clearCompleted":
      return { op: "clearCompleted" };
    default:
      return bad("Bilinmeyen işlem");
  }
}

/** İstek gövdesini (`{ ops: [...] }`) doğrular. */
export function parseTaskOps(body: unknown): ParseOpsResult {
  if (typeof body !== "object" || body === null || !Array.isArray((body as Raw).ops)) {
    return { ok: false, error: "Geçersiz istek" };
  }
  const raw = (body as { ops: unknown[] }).ops;
  if (raw.length === 0) return { ok: false, error: "İşlem yok" };
  if (raw.length > MAX_OPS) return { ok: false, error: "Çok fazla işlem" };
  try {
    return { ok: true, value: raw.map(parseOne) };
  } catch (error) {
    /* v8 ignore next */
    if (!(error instanceof ParseError)) throw error;
    return { ok: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ */
/* Uygulama                                                            */
/* ------------------------------------------------------------------ */

/** Tarih tutarlılığı: başlangıç ≤ bitiş; bitiş yoksa saat de yok. */
function normalizeDates(t: Task): Task {
  const fixed = fixRange(t);
  return fixed.dueDate === null ? { ...fixed, dueTime: null } : fixed;
}

/** Açık görev tamamlanmış bir üstün altına girdiyse tamamlanmış üstler açılır. */
function reopenDoneAncestors(tasks: Task[], id: string): Task[] {
  const t = findTask(tasks, id)!;
  if (isDone(t)) return tasks;
  const doneAncestors = new Set(
    ancestorsOf(tasks, id)
      .filter(isDone)
      .map((a) => a.id),
  );
  if (doneAncestors.size === 0) return tasks;
  return tasks.map((x) =>
    doneAncestors.has(x.id) ? { ...x, completedAt: null, completedBy: null } : x,
  );
}

function need(tasks: readonly Task[], id: string): Task {
  const t = findTask(tasks, id);
  if (!t) throw new TaskOpError("Görev bulunamadı");
  return t;
}

function needParent(tasks: readonly Task[], parentId: string | null) {
  if (parentId !== null && !findTask(tasks, parentId))
    throw new TaskOpError("Üst görev bulunamadı");
}

function applyOne(tasks: Task[], op: TaskOp, ctx: OpContext): Task[] {
  switch (op.op) {
    case "create": {
      if (findTask(tasks, op.id)) throw new TaskOpError("Görev zaten var");
      needParent(tasks, op.parentId);
      const { op: _op, id, parentId, position: pos, completed, ...rest } = op;
      const task = normalizeDates(
        makeTask(id, parentId, pos, {
          ...rest,
          completedAt: completed ? ctx.now : null,
          completedBy: completed ? ctx.userId : null,
        }),
      );
      return reopenDoneAncestors([...tasks, task], id);
    }
    case "update": {
      need(tasks, op.id);
      const { op: _op, id, ...rest } = op;
      return tasks.map((t) => (t.id === id ? normalizeDates({ ...t, ...rest }) : t));
    }
    case "move": {
      need(tasks, op.id);
      needParent(tasks, op.parentId);
      if (
        op.parentId === op.id ||
        (op.parentId !== null && isDescendant(tasks, op.parentId, op.id))
      ) {
        throw new TaskOpError("Görev kendi alt ağacına taşınamaz");
      }
      const moved = tasks.map((t) =>
        t.id === op.id ? { ...t, parentId: op.parentId, position: op.position } : t,
      );
      return reopenDoneAncestors(moved, op.id);
    }
    case "complete":
      need(tasks, op.id);
      return completeTask(tasks, op.id, ctx.now, ctx.userId).tasks;
    case "uncomplete":
      need(tasks, op.id);
      return uncompleteTask(tasks, op.id).tasks;
    case "reopen":
      return reopenTasks(tasks, op.ids).tasks;
    case "delete": {
      need(tasks, op.id);
      const ids = subtreeIds(tasks, op.id);
      if (ids.length > 1 && !op.withSubtree)
        throw new TaskOpError("Alt görevi olan görev silinemez");
      const gone = new Set(ids);
      return tasks.filter((t) => !gone.has(t.id));
    }
    case "clearCompleted":
      return clearCompleted(tasks).tasks;
  }
}

/** İşlemleri sırayla uygular; yeni liste döner (girdi değişmez). */
export function applyTaskOps(
  tasks: readonly Task[],
  ops: readonly TaskOp[],
  ctx: OpContext,
): Task[] {
  let out = [...tasks];
  for (const op of ops) out = applyOne(out, op, ctx);
  if (out.length > MAX_TASKS) throw new TaskOpError("Görev sınırına ulaşıldı");
  return out;
}

/* ------------------------------------------------------------------ */
/* Fark                                                                */
/* ------------------------------------------------------------------ */

const FIELDS = [
  "parentId",
  "position",
  "title",
  "description",
  "startDate",
  "dueDate",
  "dueTime",
  "completedAt",
  "completedBy",
] as const satisfies readonly (keyof Task)[];

export type TaskDiff = {
  /** Yeni görevler; üst görev her zaman çocuğundan önce (yabancı anahtar sırası). */
  inserted: Task[];
  /** Herhangi bir alanı değişen görevlerin yeni hali. */
  updated: Task[];
  deleted: string[];
};

export function diffTasks(before: readonly Task[], after: readonly Task[]): TaskDiff {
  const old = new Map(before.map((t) => [t.id, t]));
  const next = new Set(after.map((t) => t.id));
  const inserted = after
    .filter((t) => !old.has(t.id))
    .map((t) => ({ t, d: depthOf(after, t.id) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);
  const updated = after.filter((t) => {
    const o = old.get(t.id);
    return o !== undefined && FIELDS.some((k) => o[k] !== t[k]);
  });
  return { inserted, updated, deleted: before.filter((t) => !next.has(t.id)).map((t) => t.id) };
}
