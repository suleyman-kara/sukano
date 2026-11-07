/**
 * İyimser arayüz: sunucuya giden (henüz tamamlanmamış) not eylemlerini loader
 * verisine uygular; ızgara, yanıt gelmeden yeni hali gösterir.
 */
import type { NoteColor, NoteKind } from "~/db/schema";
import { htmlToText } from "./html";
import { planMove, topPosition } from "./ordering";
import type { NoteIntent } from "./validation";

export type NoteView = "notlar" | "arsiv" | "cop";

/** Kartta görünen en çok üst seviye görev sayısı. */
export const CARD_TASK_LIMIT = 5;

export type CardTask = { title: string; done: boolean };

/** Izgaradaki kartın verisi (loader'dan gelir). */
export type NoteCardData = {
  id: string;
  kind: NoteKind;
  title: string;
  color: NoteColor;
  pinned: boolean;
  position: number;
  /** Gövdenin düz metni (başlıksız). */
  preview: string;
  /** Yapılacaklar notunda kartta görünen ilk üst seviye görevler. */
  tasks: CardTask[];
  /** Kartta görünmeyen tamamlanmamış üst seviye görev sayısı. */
  moreTasks: number;
  /** ISO zaman damgaları. */
  updatedAt: string;
  archivedAt: string | null;
  trashedAt: string | null;
};

/** Bu görünümden çıkaran eylemler. */
const LEAVES: Record<NoteView, NoteIntent["intent"][]> = {
  notlar: ["archive", "trash", "delete", "discard"],
  arsiv: ["unarchive", "trash", "delete", "discard"],
  cop: ["restore", "delete"],
};

export function applyPendingIntents(
  notes: readonly NoteCardData[],
  pending: readonly NoteIntent[],
  view: NoteView,
  now = new Date(),
): NoteCardData[] {
  let list = [...notes];
  for (const p of pending) {
    if (p.intent === "empty-trash") {
      if (view === "cop") list = [];
      continue;
    }
    if (LEAVES[view].includes(p.intent)) {
      list = list.filter((n) => n.id !== p.id);
      continue;
    }
    switch (p.intent) {
      case "create":
        if (view === "notlar" && !list.some((n) => n.id === p.id)) {
          list.unshift({
            id: p.id,
            kind: "text",
            title: p.title,
            color: p.color,
            pinned: p.pinned,
            position: topPosition(list.map((n) => n.position)),
            preview: htmlToText(p.bodyHtml),
            tasks: [],
            moreTasks: 0,
            updatedAt: now.toISOString(),
            archivedAt: null,
            trashedAt: null,
          });
        }
        break;
      case "create-todo":
        if (view === "notlar" && !list.some((n) => n.id === p.id)) {
          const titles = p.tasks.filter((t) => t.trim());
          list.unshift({
            id: p.id,
            kind: "todo",
            title: p.title,
            color: p.color,
            pinned: p.pinned,
            position: topPosition(list.map((n) => n.position)),
            preview: "",
            tasks: titles.slice(0, CARD_TASK_LIMIT).map((title) => ({ title, done: false })),
            moreTasks: Math.max(0, titles.length - CARD_TASK_LIMIT),
            updatedAt: now.toISOString(),
            archivedAt: null,
            trashedAt: null,
          });
        }
        break;
      case "convert":
        list = list.map((n) => (n.id === p.id ? convertCard(n, p.to) : n));
        break;
      case "update":
        list = list.map((n) =>
          n.id === p.id
            ? {
                ...n,
                title: p.title ?? n.title,
                preview: p.bodyHtml === undefined ? n.preview : htmlToText(p.bodyHtml),
              }
            : n,
        );
        break;
      case "color":
        list = list.map((n) => (n.id === p.id ? { ...n, color: p.color } : n));
        break;
      case "pin":
        list = list.map((n) => (n.id === p.id ? { ...n, pinned: p.pinned } : n));
        break;
      case "duplicate": {
        const source = list.find((n) => n.id === p.id);
        if (view === "notlar" && source && !list.some((n) => n.id === p.newId)) {
          list.unshift({
            ...source,
            id: p.newId,
            pinned: false,
            position: topPosition(list.map((n) => n.position)),
            updatedAt: now.toISOString(),
          });
        }
        break;
      }
      case "move": {
        const section = list.filter((n) => n.pinned === p.pinned);
        const { updates } = planMove(section, p.id, p.toIndex);
        const next = new Map(updates.map((u) => [u.id, u.position]));
        list = list.map((n) => (next.has(n.id) ? { ...n, position: next.get(n.id)! } : n));
        break;
      }
    }
  }
  return list;
}

/** Dönüşümün karttaki yaklaşık hali (sunucu yanıtı gelene kadar). */
function convertCard(n: NoteCardData, to: NoteKind): NoteCardData {
  if (n.kind === to) return n;
  if (to === "todo") {
    const lines = n.preview.split("\n").filter((l) => l.trim());
    return {
      ...n,
      kind: "todo",
      preview: "",
      tasks: lines.slice(0, CARD_TASK_LIMIT).map((title) => ({ title, done: false })),
      moreTasks: Math.max(0, lines.length - CARD_TASK_LIMIT),
    };
  }
  return {
    ...n,
    kind: "text",
    preview: n.tasks.map((t) => t.title).join("\n"),
    tasks: [],
    moreTasks: 0,
  };
}
