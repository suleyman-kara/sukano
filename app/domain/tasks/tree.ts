/**
 * Görev ağacı işlemleri (PLAN §3, prototip `docs/design/TodoNote.dc.html`): ekle/böl,
 * alt görev, girinti, girintiyi azalt, kardeşler arası taşıma, sürükle-bırak, silme ve
 * görünür satırlar. Hepsi saf ve değişmezdir.
 *
 * Her düzenleme {@link TreeEdit} döner: yeni liste ve sunucuya gönderilecek işlemler
 * (`ops`, bkz. `ops.ts`). Yeni liste işlemlerin `applyTaskOps` ile uygulanmasıyla
 * üretilir, böylece istemci ile sunucu aynı sonucu görür. İşlem uygulanamıyorsa
 * (ilk kardeşi girintileme, kendi alt ağacına bırakma …) null döner.
 */
import { MIN_POSITION_GAP, positionBetween } from "~/domain/notes/ordering";
import {
  byPosition,
  childrenOf,
  findTask,
  isDescendant,
  isDone,
  subtreeIds,
  treeOrder,
  type Task,
  type TaskFields,
} from "./model";
import { applyTaskOps, type TaskOp } from "./ops";

export type TreeNode = Task & { children: TreeNode[] };

export type TreeEdit = { tasks: Task[]; ops: TaskOp[] };

/** Ekleme sonucu: odak nereye, imleç kaçıncı karakterde. */
export type InsertEdit = TreeEdit & { createdId: string; focusId: string; caret: number };

export type ChildCounts = { done: number; total: number; label: string };

export type TaskRow = {
  kind: "task";
  id: string;
  task: Task;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  counts: ChildCounts;
};

/** Bir seviyenin "Tamamlananlar (n)" başlığı. */
export type DoneHeaderRow = {
  kind: "done-header";
  /** Aç/kapa durumunun anahtarı: üst görev kimliği ya da "root". */
  key: string;
  parentId: string | null;
  depth: number;
  count: number;
  open: boolean;
};

export type VisibleRow = TaskRow | DoneHeaderRow;

const LOCAL = { now: 0, userId: "" };

function run(tasks: readonly Task[], ops: TaskOp[]): TreeEdit {
  return { tasks: applyTaskOps(tasks, ops, LOCAL), ops };
}

/* ------------------------------------------------------------------ */
/* Okuma                                                               */
/* ------------------------------------------------------------------ */

export function buildTree(tasks: readonly Task[]): TreeNode[] {
  const make = (parentId: string | null): TreeNode[] =>
    childrenOf(tasks, parentId).map((t) => ({ ...t, children: make(t.id) }));
  return make(null);
}

export function childCounts(tasks: readonly Task[], id: string): ChildCounts {
  const kids = childrenOf(tasks, id);
  const done = kids.filter(isDone).length;
  return { done, total: kids.length, label: `${done}/${kids.length}` };
}

export const doneGroupKey = (parentId: string | null) => parentId ?? "root";

/** "Tümünü aç" için alt görevi olan görevler. */
export function idsWithChildren(tasks: readonly Task[]): string[] {
  const parents = new Set(tasks.map((t) => t.parentId).filter((p): p is string => p !== null));
  return tasks.filter((t) => parents.has(t.id)).map((t) => t.id);
}

/**
 * Ekranda görünen satırlar. Her seviyede önce açık görevler (açıksa çocuklarıyla),
 * sonra o seviyenin tamamlananları için başlık ve (grup açıksa) tamamlananlar.
 * `settling`: yeni tamamlanıp 1,2 sn yerinde bekleyen görevler açık listede kalır.
 */
export function visibleRows(
  tasks: readonly Task[],
  expanded: ReadonlySet<string>,
  doneOpen: ReadonlySet<string>,
  settling: ReadonlySet<string> = new Set(),
): VisibleRow[] {
  const out: VisibleRow[] = [];
  const kidsOf = new Map<string | null, Task[]>();
  for (const t of [...tasks].sort(byPosition)) {
    kidsOf.set(t.parentId, [...(kidsOf.get(t.parentId) ?? []), t]);
  }
  const push = (t: Task, depth: number) => {
    const kids = kidsOf.get(t.id) ?? [];
    const done = kids.filter(isDone).length;
    const open = expanded.has(t.id) && kids.length > 0;
    out.push({
      kind: "task",
      id: t.id,
      task: t,
      depth,
      hasChildren: kids.length > 0,
      expanded: open,
      counts: { done, total: kids.length, label: `${done}/${kids.length}` },
    });
    if (open) build(t.id, depth + 1);
  };
  const build = (parentId: string | null, depth: number) => {
    const kids = kidsOf.get(parentId) ?? [];
    const inPlace = (t: Task) => !isDone(t) || settling.has(t.id);
    kids.filter(inPlace).forEach((t) => push(t, depth));
    const done = kids.filter((t) => !inPlace(t));
    if (done.length === 0) return;
    const key = doneGroupKey(parentId);
    const open = doneOpen.has(key);
    out.push({ kind: "done-header", key, parentId, depth, count: done.length, open });
    if (open) done.forEach((t) => push(t, depth));
  };
  build(null, 0);
  return out;
}

/**
 * Ctrl+Enter ile tamamlanan satırdan sonra odak: sonraki görünür satır; tamamlanan ya
 * da alt ağacı aşağı inenler atlanır. Yoksa önceki satır; o da yoksa null
 * (odak "Görev ekle" düğmesine).
 */
export function focusAfterComplete(
  tasks: readonly Task[],
  visibleIds: readonly string[],
  id: string,
  changed: readonly string[],
): string | null {
  const leaving = new Set(changed.flatMap((c) => subtreeIds(tasks, c)));
  const i = visibleIds.indexOf(id);
  for (let j = i + 1; j < visibleIds.length; j++)
    if (!leaving.has(visibleIds[j]!)) return visibleIds[j]!;
  for (let j = i - 1; j >= 0; j--) if (!leaving.has(visibleIds[j]!)) return visibleIds[j]!;
  return null;
}

/* ------------------------------------------------------------------ */
/* Konum                                                               */
/* ------------------------------------------------------------------ */

/**
 * `parentId`'nin çocukları arasında `index` sırasına (taşınan görev hariç sayılarak)
 * bir konum. Komşular çok sıkışmışsa kardeşler 0, 1, 2 … diye yeniden numaralanır.
 */
function placeAt(
  tasks: readonly Task[],
  parentId: string | null,
  index: number,
  excludeId?: string,
): { position: number; renumber: TaskOp[] } {
  const sibs = childrenOf(tasks, parentId).filter((t) => t.id !== excludeId);
  const i = Math.max(0, Math.min(index, sibs.length));
  const before = sibs[i - 1]?.position ?? null;
  const after = sibs[i]?.position ?? null;
  if (before !== null && after !== null && after - before < MIN_POSITION_GAP * 2) {
    const renumber: TaskOp[] = [];
    sibs.forEach((s, k) => {
      const position = k < i ? k : k + 1;
      if (s.position !== position) renumber.push({ op: "move", id: s.id, parentId, position });
    });
    return { position: i, renumber };
  }
  return { position: positionBetween(before, after), renumber: [] };
}

/** Görevi `parentId` altında, (kendisi hariç) tüm kardeşler arasında `index`'e taşır. */
function moveOps(
  tasks: readonly Task[],
  id: string,
  parentId: string | null,
  index: number,
): TaskOp[] {
  const { position, renumber } = placeAt(tasks, parentId, index, id);
  return [...renumber, { op: "move", id, parentId, position }];
}

/** Görevin kardeşleri arasındaki sırası (tüm kardeşler, kendisi dahil). */
const indexAmong = (tasks: readonly Task[], t: Task) =>
  childrenOf(tasks, t.parentId).findIndex((s) => s.id === t.id);

/* ------------------------------------------------------------------ */
/* Ekleme                                                              */
/* ------------------------------------------------------------------ */

function createAt(
  tasks: readonly Task[],
  id: string,
  parentId: string | null,
  index: number,
  title: string,
): TaskOp[] {
  const { position, renumber } = placeAt(tasks, parentId, index);
  return [...renumber, { op: "create", id, parentId, position, title }];
}

/**
 * Enter: altına aynı seviyede yeni görev (alt ağacın ardına). `caret` başlığın
 * ortasındaysa metin bölünür, kalan kısım yeni göreve geçer. İmleç baştaysa ve başlık
 * doluysa yeni boş satır üste eklenir; metin, tarih ve atamalar bu satırda kalır.
 */
export function insertAfter(
  tasks: readonly Task[],
  id: string,
  newId: string,
  caret?: number,
): InsertEdit | null {
  const t = findTask(tasks, id);
  if (!t) return null;
  const at = Math.max(0, Math.min(caret ?? t.title.length, t.title.length));
  const index = indexAmong(tasks, t);
  if (at === 0 && t.title !== "") {
    const edit = run(tasks, createAt(tasks, newId, t.parentId, index, ""));
    return { ...edit, createdId: newId, focusId: id, caret: 0 };
  }
  const before = t.title.slice(0, at);
  const after = t.title.slice(at);
  const ops: TaskOp[] = after ? [{ op: "update", id, title: before }] : [];
  ops.push(...createAt(tasks, newId, t.parentId, index + 1, after));
  return { ...run(tasks, ops), createdId: newId, focusId: newId, caret: 0 };
}

/** Enter tuşu: boş alt görevde girintiyi azaltır, aksi halde {@link insertAfter}. */
export function enterKey(
  tasks: readonly Task[],
  id: string,
  newId: string,
  caret?: number,
): (TreeEdit & { focusId: string; caret: number; createdId?: string }) | null {
  const t = findTask(tasks, id);
  if (!t) return null;
  if (t.title === "" && t.parentId !== null) {
    return { ...outdent(tasks, id)!, focusId: id, caret: 0 };
  }
  return insertAfter(tasks, id, newId, caret);
}

/** "Alt görev ekle": son çocuk olarak eklenir; üst görev açılmalı (`expand`). */
export function insertChild(
  tasks: readonly Task[],
  parentId: string,
  newId: string,
  title = "",
): (InsertEdit & { expand: string }) | null {
  if (!findTask(tasks, parentId)) return null;
  const index = childrenOf(tasks, parentId).length;
  const edit = run(tasks, createAt(tasks, newId, parentId, index, title));
  return { ...edit, createdId: newId, focusId: newId, caret: 0, expand: parentId };
}

/** "Görev ekle": üst seviyenin sonuna boş görev. */
export function appendTask(tasks: readonly Task[], newId: string, title = ""): InsertEdit {
  const edit = run(tasks, createAt(tasks, newId, null, childrenOf(tasks, null).length, title));
  return { ...edit, createdId: newId, focusId: newId, caret: 0 };
}

/* ------------------------------------------------------------------ */
/* Yapı                                                                */
/* ------------------------------------------------------------------ */

/** Tab: bir önceki açık kardeşin son çocuğu olur (alt ağacıyla). Üst açılmalı (`expand`). */
export function indent(tasks: readonly Task[], id: string): (TreeEdit & { expand: string }) | null {
  const t = findTask(tasks, id);
  if (!t || isDone(t)) return null;
  const open = childrenOf(tasks, t.parentId).filter((s) => !isDone(s));
  const prev = open[open.findIndex((s) => s.id === id) - 1];
  if (!prev) return null;
  const edit = run(tasks, moveOps(tasks, id, prev.id, childrenOf(tasks, prev.id).length));
  return { ...edit, expand: prev.id };
}

/** Shift+Tab: üstünün hemen ardına, kendi alt ağacıyla. Sonraki kardeşler üstte kalır. */
export function outdent(tasks: readonly Task[], id: string): TreeEdit | null {
  const t = findTask(tasks, id);
  const parent = t?.parentId ? findTask(tasks, t.parentId) : undefined;
  if (!t || !parent) return null;
  return run(tasks, moveOps(tasks, id, parent.parentId, indexAmong(tasks, parent) + 1));
}

/** Alt+↑ / Alt+↓: aynı tamamlanma durumundaki kardeşler arasında bir adım. */
export function moveAmongSiblings(
  tasks: readonly Task[],
  id: string,
  dir: -1 | 1,
): TreeEdit | null {
  const t = findTask(tasks, id);
  if (!t) return null;
  const same = childrenOf(tasks, t.parentId).filter((s) => isDone(s) === isDone(t));
  const target = same[same.findIndex((s) => s.id === id) + dir];
  if (!target) return null;
  const others = childrenOf(tasks, t.parentId).filter((s) => s.id !== id);
  const ti = others.findIndex((s) => s.id === target.id);
  return run(tasks, moveOps(tasks, id, t.parentId, dir < 0 ? ti : ti + 1));
}

/**
 * Sürükle-bırak: `parentId` altına, aynı tamamlanma durumundaki kardeşler arasında
 * (kendisi hariç) `index` sırasına. Kendi alt ağacına bırakma, olmayan üst ve yerini
 * değiştirmeyen bırakma null döner.
 */
export function moveTo(
  tasks: readonly Task[],
  id: string,
  parentId: string | null,
  index: number,
): TreeEdit | null {
  const t = findTask(tasks, id);
  if (!t) return null;
  if (parentId !== null) {
    if (parentId === id || !findTask(tasks, parentId) || isDescendant(tasks, parentId, id))
      return null;
  }
  const others = childrenOf(tasks, parentId).filter((s) => s.id !== id);
  const same = others.filter((s) => isDone(s) === isDone(t));
  const i = Math.max(0, Math.min(index, same.length));
  if (parentId === t.parentId) {
    const current = childrenOf(tasks, parentId)
      .filter((s) => isDone(s) === isDone(t))
      .findIndex((s) => s.id === id);
    if (current === i) return null;
  }
  let at: number;
  if (i < same.length) at = others.indexOf(same[i]!);
  else if (same.length > 0) at = others.indexOf(same[same.length - 1]!) + 1;
  else at = isDone(t) ? others.length : 0;
  return run(tasks, moveOps(tasks, id, parentId, at));
}

/* ------------------------------------------------------------------ */
/* Silme ve geri yükleme                                               */
/* ------------------------------------------------------------------ */

/**
 * Görevi siler. Alt görevi varsa `withSubtree` olmadan reddedilir (null; arayüz satırı
 * sallar). `removed`: geri yükleme için üstten alta silinenler.
 */
export function remove(
  tasks: readonly Task[],
  id: string,
  options: { withSubtree?: boolean } = {},
): (TreeEdit & { removed: Task[] }) | null {
  if (!findTask(tasks, id)) return null;
  const ids = new Set(subtreeIds(tasks, id));
  if (ids.size > 1 && !options.withSubtree) return null;
  const op: TaskOp = ids.size > 1 ? { op: "delete", id, withSubtree: true } : { op: "delete", id };
  return { ...run(tasks, [op]), removed: treeOrder(tasks).filter((t) => ids.has(t.id)) };
}

/**
 * Silinen ya da "Tamamlananları sil" ile kaldırılan görevleri aynı kimlik ve konumla
 * geri getirir (geri al). Yerel liste görevlerin önceki halini aynen alır.
 */
export function restoreTasks(tasks: readonly Task[], removed: readonly Task[]): TreeEdit {
  const ops: TaskOp[] = removed.map((t) => ({
    op: "create",
    id: t.id,
    parentId: t.parentId,
    position: t.position,
    title: t.title,
    description: t.description,
    startDate: t.startDate,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    completed: isDone(t),
  }));
  const present = new Set(tasks.map((t) => t.id));
  return { tasks: [...tasks, ...removed.filter((t) => !present.has(t.id))], ops };
}

/** Başlık, açıklama ve tarih alanlarını günceller (tarih kuralı uygulanır). */
export function updateTask(
  tasks: readonly Task[],
  id: string,
  fields: Partial<TaskFields>,
): TreeEdit | null {
  if (!findTask(tasks, id)) return null;
  return run(tasks, [{ op: "update", id, ...fields }]);
}
