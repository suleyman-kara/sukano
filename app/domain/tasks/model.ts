/**
 * Görev ağacı veri modeli (PLAN §3 Yapılacaklar notu). Ağaç, veritabanındaki gibi
 * düz bir listedir: her görevin `parentId`'si (üst seviyede null) ve kardeşleri
 * arasındaki kesirli `position`'ı vardır. Kardeş sırası `position`, eşitlikte `id`.
 *
 * Bu modüldeki yardımcılar saf ve değişmezdir (girdi listesini değiştirmez); sunucu
 * (`app/lib/tasks.server.ts`) ve istemci (yapılacaklar notu arayüzü) aynı kodu kullanır.
 */

export type Task = {
  id: string;
  /** Üst görev; null ise üst seviye. */
  parentId: string | null;
  /** Kardeşler arasındaki sıra (küçük önce). */
  position: number;
  title: string;
  /** Hafif biçimlendirmeli açıklama (HTML); boşsa "". */
  description: string;
  /** `YYYY-MM-DD` */
  startDate: string | null;
  /** `YYYY-MM-DD` */
  dueDate: string | null;
  /** `HH:MM`; yalnızca bitiş tarihi varken anlamlı. */
  dueTime: string | null;
  /** Tamamlanma anı (ms); null ise açık. */
  completedAt: number | null;
  completedBy: string | null;
};

/** Sürükle-bırak, girinti ve sıralama sonuçları: görevin yeni yeri. */
export type Placement = { id: string; parentId: string | null; position: number };

/** Kullanıcının düzenleyebildiği alanlar. */
export type TaskFields = Pick<Task, "title" | "description" | "startDate" | "dueDate" | "dueTime">;

export const isDone = (t: Pick<Task, "completedAt">) => t.completedAt !== null;

export function makeTask(
  id: string,
  parentId: string | null,
  position: number,
  fields: Partial<Omit<Task, "id" | "parentId" | "position">> = {},
): Task {
  return {
    id,
    parentId,
    position,
    title: "",
    description: "",
    startDate: null,
    dueDate: null,
    dueTime: null,
    completedAt: null,
    completedBy: null,
    ...fields,
  };
}

export const byPosition = (a: Task, b: Task) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Bir üstün çocukları, sıralı. */
export function childrenOf(tasks: readonly Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => t.parentId === parentId).sort(byPosition);
}

export function findTask(tasks: readonly Task[], id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

/** Üstten köke doğru üst görevler (en yakın önce). Döngüye karşı korumalı. */
export function ancestorsOf(tasks: readonly Task[], id: string): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: Task[] = [];
  const seen = new Set<string>([id]);
  let p = byId.get(id)?.parentId ?? null;
  while (p !== null && !seen.has(p)) {
    const parent = byId.get(p);
    if (!parent) break;
    out.push(parent);
    seen.add(p);
    p = parent.parentId;
  }
  return out;
}

/** `id` `ofId`'nin alt ağacında mı (kendisi hariç)? */
export function isDescendant(tasks: readonly Task[], id: string, ofId: string): boolean {
  return ancestorsOf(tasks, id).some((a) => a.id === ofId);
}

/** Görev ve tüm alt görevlerinin kimlikleri (önce görev, sonra derinlik öncelikli sıra). */
export function subtreeIds(tasks: readonly Task[], id: string): string[] {
  const kids = new Map<string | null, Task[]>();
  for (const t of tasks) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  const out: string[] = [];
  const walk = (x: string) => {
    out.push(x);
    for (const k of (kids.get(x) ?? []).sort(byPosition)) walk(k.id);
  };
  if (tasks.some((t) => t.id === id)) walk(id);
  return out;
}

export function depthOf(tasks: readonly Task[], id: string): number {
  return ancestorsOf(tasks, id).length;
}

/** Görevleri derinlik öncelikli ağaç sırasında verir (her üstün çocukları konuma göre). */
export function treeOrder(tasks: readonly Task[]): Task[] {
  const kids = new Map<string | null, Task[]>();
  for (const t of tasks) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  const out: Task[] = [];
  const walk = (parent: string | null) => {
    for (const k of (kids.get(parent) ?? []).sort(byPosition)) {
      out.push(k);
      walk(k.id);
    }
  };
  walk(null);
  return out;
}

export function hasChildren(tasks: readonly Task[], id: string): boolean {
  return tasks.some((t) => t.parentId === id);
}
