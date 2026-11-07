/**
 * Metin ↔ yapılacaklar dönüşümü (PLAN §3): metnin satırları (madde listeleri dahil)
 * üst seviye görev olur; görevler girintisi korunarak iç içe madde listesine döner.
 * Eki olan metin notu, ekler kaldırılmadan yapılacaklara dönüştürülemez (PLAN §10).
 */
import { htmlToText } from "~/domain/notes/html";
import { childrenOf, makeTask, treeOrder, type Task } from "./model";
import { MAX_TASK_TITLE_LENGTH } from "./ops";

export const ATTACHMENT_BLOCK_MESSAGE =
  "Eki olan metin notu önce ekler kaldırılmadan yapılacaklara dönüştürülemez.";

export type TaskLine = { title: string; done: boolean };

const BULLET = /^(?:[-*•·]|\d+[.)])\s+/;
const CHECKBOX = /^\[([ xX])\]\s*/;

/** Metin notu gövdesinin satırları → görev satırları. */
export function textToTaskLines(html: string | null | undefined): TaskLine[] {
  const out: TaskLine[] = [];
  for (const raw of htmlToText(html).split("\n")) {
    let line = raw.replace(BULLET, "");
    let done = false;
    const box = line.match(CHECKBOX);
    if (box) {
      done = box[1] !== " ";
      line = line.slice(box[0].length);
    }
    line = line.trim();
    if (!line || /^[-*•·]$/.test(line)) continue;
    out.push({ title: line.slice(0, MAX_TASK_TITLE_LENGTH), done });
  }
  return out;
}

/** Satırlardan sıralı üst seviye görevler. */
export function linesToTasks(
  lines: readonly TaskLine[],
  newId: () => string,
  now: number,
  userId: string,
): Task[] {
  return lines.map((l, i) =>
    makeTask(newId(), null, i, {
      title: l.title,
      completedAt: l.done ? now : null,
      completedBy: l.done ? userId : null,
    }),
  );
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Görevler → iç içe madde listesi (Tiptap biçimi: `<li><p>…</p></li>`). */
export function tasksToHtml(tasks: readonly Task[]): string {
  const list = (parentId: string | null): string => {
    const items = childrenOf(tasks, parentId)
      .map((t) => {
        const kids = list(t.id);
        if (!t.title.trim() && !kids) return "";
        return `<li><p>${escapeHtml(t.title)}</p>${kids}</li>`;
      })
      .join("");
    return items ? `<ul>${items}</ul>` : "";
  };
  return list(null);
}

export function canConvertToTodo(
  attachmentCount: number,
): { ok: true } | { ok: false; error: string } {
  return attachmentCount > 0 ? { ok: false, error: ATTACHMENT_BLOCK_MESSAGE } : { ok: true };
}

/** Yapılacaklar notunun sürüm anlık görüntüsü. */
export type TodoSnapshot = {
  /** Önizleme için madde listesi HTML'i. */
  html: string;
  /** Görev başlıkları, ağaç sırasında. */
  text: string;
  /** Görev ağacı: düz liste (parentId + position); geri yüklemede aynen yazılır. */
  tasks: Task[];
};

export function todoSnapshot(tasks: readonly Task[]): TodoSnapshot {
  const ordered = treeOrder(tasks);
  return {
    html: tasksToHtml(tasks),
    text: ordered
      .map((t) => t.title.trim())
      .filter(Boolean)
      .join("\n"),
    tasks: ordered,
  };
}
