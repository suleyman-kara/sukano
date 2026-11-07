/**
 * Görev sürükle-bırak hedefi (dnd-kit "sortable tree" yaklaşımı): sürüklenen satırın
 * düşeceği sıra ve yatay ofsetten girinti seviyesi hesaplanır; sonuç `moveTo`
 * (app/domain/tasks/tree.ts) için üst görev ve kardeş sırasıdır. Yalnızca görünür açık
 * (tamamlanmamış) satırlar hedeftir.
 */

export type DragRow = { id: string; parentId: string | null; depth: number; expanded: boolean };

export type DropTarget = {
  depth: number;
  parentId: string | null;
  /** Yeni üstün açık çocukları arasında sıra (taşınan hariç). */
  index: number;
  /** Bırakılınca açılması gereken üst (kapalıysa ya da ilk çocuğu oluyorsa). */
  expand: string | null;
};

/** Kapalı bir üstün altına bırakılınca sona eklenir. */
export const APPEND = Number.MAX_SAFE_INTEGER;

/** Görünür satırlardan sürüklenenin görünür alt satırlarını çıkarır. */
export function withoutDescendants(rows: readonly DragRow[], activeId: string): DragRow[] {
  const i = rows.findIndex((r) => r.id === activeId);
  if (i < 0) return [...rows];
  let j = i + 1;
  while (j < rows.length && rows[j]!.depth > rows[i]!.depth) j++;
  return [...rows.slice(0, i + 1), ...rows.slice(j)];
}

export function projectDrop(
  rows: readonly DragRow[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentWidth: number,
): DropTarget | null {
  const items = withoutDescendants(rows, activeId);
  const from = items.findIndex((r) => r.id === activeId);
  const to = items.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return null;
  const active = items[from]!;
  const moved = [...items];
  moved.splice(from, 1);
  moved.splice(to, 0, active);
  const prev = moved[to - 1];
  const next = moved[to + 1];
  const projected = active.depth + Math.round(offsetX / indentWidth);
  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, projected));

  let parentId: string | null = null;
  if (depth > 0 && prev) {
    if (depth === prev.depth + 1) parentId = prev.id;
    else if (depth === prev.depth) parentId = prev.parentId;
    else
      parentId =
        moved
          .slice(0, to)
          .reverse()
          .find((r) => r.depth === depth)?.parentId ?? null;
  }

  let index = moved.slice(0, to).filter((r) => r.parentId === parentId).length;
  let expand: string | null = null;
  if (parentId !== null && prev && parentId === prev.id) {
    expand = prev.id;
    if (!prev.expanded) index = APPEND;
  }
  return { depth, parentId, index, expand };
}
