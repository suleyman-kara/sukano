/**
 * Tamamlama kuralları (PLAN §3):
 * - Görev işaretlenince tüm alt ağacı tamamlanır.
 * - Bir üstün tüm çocukları tamamlanınca üst kendiliğinden tamamlanır; zincir yukarı sürer.
 * - Geri açılan görevin alt ağacı ve tamamlanmış tüm üstleri açılır.
 *
 * Sunucu bu kuralları kendisi uygular (istemcinin gönderdiği zincire güvenmez):
 * `complete` / `uncomplete` / `reopen` işlemleri buradaki fonksiyonlarla hesaplanır.
 */
import { ancestorsOf, findTask, isDone, subtreeIds, treeOrder, type Task } from "./model";
import type { TaskOp } from "./ops";

export type CompletionPatch = Pick<Task, "id" | "completedAt" | "completedBy">;

export type CompletionChange = {
  tasks: Task[];
  /** Durumu değişen görevler: önce işaretlenen, sonra alt ağaç, sonra üstler (yakından uzağa). */
  changed: string[];
};

export type ToggleResult = CompletionChange & {
  /** true: tamamlandı; false: geri açıldı. */
  completed: boolean;
  /** Zincirle kendiliğinden tamamlanan en üstteki görev (toast metni için). */
  chain: { parentId?: string; parentTitle?: string };
  /** Değişen görevlerin yeni tamamlanma alanları. */
  patch: CompletionPatch[];
  /** Önceki halleri: uygulanınca işlem birebir geri alınır. */
  inverse: CompletionPatch[];
  /** Sunucuya gidecek işlem (zinciri sunucu yeniden hesaplar). */
  ops: TaskOp[];
};

function setCompletion(
  tasks: readonly Task[],
  ids: ReadonlySet<string>,
  at: number | null,
  by: string | null,
) {
  return tasks.map((t) => (ids.has(t.id) ? { ...t, completedAt: at, completedBy: by } : t));
}

/** Görevi alt ağacıyla tamamlar ve zinciri yukarı yürütür. */
export function completeTask(
  tasks: readonly Task[],
  id: string,
  now: number,
  userId: string,
): CompletionChange & { top: Task | null } {
  const target = findTask(tasks, id);
  if (!target || isDone(target)) return { tasks: [...tasks], changed: [], top: null };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const changed = subtreeIds(tasks, id).filter((x) => !isDone(byId.get(x)!));
  const doneSet = new Set([...tasks.filter(isDone).map((t) => t.id), ...changed]);
  let top: Task | null = null;
  for (const parent of ancestorsOf(tasks, id)) {
    const kids = tasks.filter((t) => t.parentId === parent.id);
    if (!kids.every((k) => doneSet.has(k.id))) break;
    if (!doneSet.has(parent.id)) {
      doneSet.add(parent.id);
      changed.push(parent.id);
      top = parent;
    }
  }
  return { tasks: setCompletion(tasks, new Set(changed), now, userId), changed, top };
}

/** Görevi alt ağacıyla geri açar; tamamlanmış tüm üstler de açılır. */
export function uncompleteTask(tasks: readonly Task[], id: string): CompletionChange {
  const target = findTask(tasks, id);
  if (!target || !isDone(target)) return { tasks: [...tasks], changed: [] };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const changed = [
    ...subtreeIds(tasks, id).filter((x) => isDone(byId.get(x)!)),
    ...ancestorsOf(tasks, id)
      .filter(isDone)
      .map((t) => t.id),
  ];
  return { tasks: setCompletion(tasks, new Set(changed), null, null), changed };
}

/**
 * Geri al: tam olarak verilen görevleri açar (alt ağaçlarına dokunmaz); tutarlılık için
 * açılanların tamamlanmış üstleri de açılır. Bilinmeyen kimlikler yok sayılır.
 */
export function reopenTasks(
  tasks: readonly Task[],
  ids: readonly string[],
): CompletionChange & { ops: TaskOp[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const changed: string[] = [];
  const add = (t: Task | undefined) => {
    if (t && isDone(t) && !changed.includes(t.id)) changed.push(t.id);
  };
  for (const id of ids) add(byId.get(id));
  for (const id of ids) {
    if (byId.get(id) && changed.includes(id)) ancestorsOf(tasks, id).forEach(add);
  }
  return {
    tasks: setCompletion(tasks, new Set(changed), null, null),
    changed,
    ops: [{ op: "reopen", ids: [...ids] }],
  };
}

/** Kutucuk / Ctrl+Enter: tamamla ya da geri aç. Bilinmeyen görevde null. */
export function toggleComplete(
  tasks: readonly Task[],
  id: string,
  now: number,
  userId: string,
): ToggleResult | null {
  const target = findTask(tasks, id);
  if (!target) return null;
  const completing = !isDone(target);
  const before = new Map(tasks.map((t) => [t.id, t]));
  const result: CompletionChange & { top?: Task | null } = completing
    ? completeTask(tasks, id, now, userId)
    : uncompleteTask(tasks, id);
  const after = new Map(result.tasks.map((t) => [t.id, t]));
  const pick = (t: Task): CompletionPatch => ({
    id: t.id,
    completedAt: t.completedAt,
    completedBy: t.completedBy,
  });
  const top = result.top ?? null;
  return {
    tasks: result.tasks,
    changed: result.changed,
    completed: completing,
    chain: top ? { parentId: top.id, parentTitle: top.title } : {},
    patch: result.changed.map((c) => pick(after.get(c)!)),
    inverse: result.changed.map((c) => pick(before.get(c)!)),
    ops: [{ op: completing ? "complete" : "uncomplete", id }],
  };
}

/** Tamamlanma yamasını uygular (yeni liste). */
export function applyCompletionPatch(
  tasks: readonly Task[],
  patch: readonly CompletionPatch[],
): Task[] {
  const byId = new Map(patch.map((p) => [p.id, p]));
  return tasks.map((t) => {
    const p = byId.get(t.id);
    return p ? { ...t, completedAt: p.completedAt, completedBy: p.completedBy } : t;
  });
}

/**
 * "Tamamlananları sil": tamamlanmış her görev alt ağacıyla silinir. `removed` geri
 * yükleme için üstten alta (ağaç) sırasındadır.
 */
export function clearCompleted(tasks: readonly Task[]): {
  tasks: Task[];
  removed: Task[];
  ops: TaskOp[];
} {
  const gone = new Set<string>();
  for (const t of tasks) if (isDone(t)) subtreeIds(tasks, t.id).forEach((x) => gone.add(x));
  return {
    tasks: tasks.filter((t) => !gone.has(t.id)),
    removed: treeOrder(tasks).filter((t) => gone.has(t.id)),
    ops: [{ op: "clearCompleted" }],
  };
}
