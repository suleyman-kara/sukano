/**
 * Görev ağacı testleri için örnek veri: prototipteki (docs/design/TodoNote.dc.html)
 * `INITIAL` ağacı, aynı kimliklerle.
 */
import { makeTask, treeOrder, type Task } from "~/domain/tasks/model";

export type Spec = {
  id: string;
  title?: string;
  done?: boolean;
  start?: string;
  due?: string;
  time?: string;
  kids?: Spec[];
};

export const DONE_AT = 1_000;

export function fromSpec(specs: Spec[], parentId: string | null = null): Task[] {
  return specs.flatMap((s, i) => [
    makeTask(s.id, parentId, i, {
      title: s.title ?? s.id,
      startDate: s.start ?? null,
      dueDate: s.due ?? null,
      dueTime: s.time ?? null,
      completedAt: s.done ? DONE_AT : null,
      completedBy: s.done ? "ben" : null,
    }),
    ...fromSpec(s.kids ?? [], s.id),
  ]);
}

/** Ağacı okunur satırlara çevirir: girinti iki boşluk, tamamlananlar "✓". */
export function outline(tasks: readonly Task[]): string[] {
  const depth = (t: Task): number => {
    let d = 0;
    let p = t.parentId;
    while (p) {
      d++;
      p = tasks.find((x) => x.id === p)?.parentId ?? null;
    }
    return d;
  };
  return treeOrder(tasks).map(
    (t) => `${"  ".repeat(depth(t))}${t.id}${t.completedAt !== null ? " ✓" : ""}`,
  );
}

export const done = (tasks: readonly Task[], id: string) =>
  tasks.find((t) => t.id === id)!.completedAt !== null;

export const INITIAL: Spec[] = [
  {
    id: "t1",
    title: "Tasarım onayı",
    kids: [
      { id: "t11", title: "Ana sayfa taslağı", done: true },
      { id: "t12", title: "Ürün sayfası", due: "2026-11-06" },
      { id: "t13", title: "Mobil görünüm" },
    ],
  },
  {
    id: "t2",
    title: "İçerik yazımı",
    start: "2026-11-03",
    due: "2026-11-12",
    time: "17:00",
    kids: [
      { id: "t21", title: "Hakkımızda metni", done: true },
      { id: "t22", title: "Ürün açıklamaları" },
      {
        id: "t23",
        title: "SSS",
        kids: [
          { id: "t231", title: "Kargo soruları" },
          { id: "t232", title: "İade soruları" },
        ],
      },
    ],
  },
  { id: "t3", title: "SEO kontrolleri", due: "2026-11-04" },
  { id: "t6", title: "Lansman duyurusu", due: "2026-11-20" },
  {
    id: "t4",
    title: "Barındırma kurulumu",
    done: true,
    kids: [{ id: "t41", title: "Teklifi onaylat ve sözleşmeyi imzala", done: true }],
  },
  { id: "t5", title: "Alan adı yönlendirmesi", done: true },
];

export const initial = () => fromSpec(INITIAL);
