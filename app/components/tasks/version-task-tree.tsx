import { cn } from "cn";
import { isDone, treeOrder, depthOf, type Task } from "~/domain/tasks/model";
import { formatRange, todayIn } from "~/domain/tasks/dates";

/**
 * Sürüm önizlemesinde görev ağacı (salt okunur): girintili satırlar, tamamlananlar
 * üstü çizili, tarih ipucu. Tümü açık gösterilir.
 */
export function VersionTaskTree({ tasks }: { tasks: readonly Task[] }) {
  const today = todayIn();
  const ordered = treeOrder(tasks);
  if (ordered.length === 0) {
    return <p className="m-0 text-muted-foreground">Bu sürümde görev yok.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Görevler">
      {ordered.map((t) => {
        const done = isDone(t);
        const range = formatRange(t.startDate, t.dueDate, today);
        return (
          <li
            key={t.id}
            className="flex min-h-7 items-center gap-2.5"
            style={{ paddingLeft: depthOf(tasks, t.id) * 24 }}
          >
            <span
              className={cn(
                "size-4 shrink-0 rounded-[5px] border-[1.5px] border-muted-foreground",
                done && "border-primary bg-primary",
              )}
              aria-hidden="true"
            />
            <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>
              {t.title || "Adsız görev"}
              {done && <span className="sr-only"> (tamamlandı)</span>}
            </span>
            {range && (
              <span className="shrink-0 rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
                {range}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
