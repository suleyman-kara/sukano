import { Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/ui/sheet";
import { childrenOf, isDone, type Task } from "~/domain/tasks/model";
import { childCounts } from "~/domain/tasks/tree";
import { PersonChip } from "./person-picker";
import { DateChip, DescriptionEditor, type DetailPeople } from "./task-detail";
import { checkboxLabel } from "./task-row";

/**
 * Mobil alttan açılan sayfa iskeleti (Forms "Mobil sheet kuralı"): tutamak ve
 * karartma "Kapat" düğmesidir, anında uygulanan sayfalarda sağ üstte "Bitti".
 */
export function TodoSheet({
  open,
  onOpenChange,
  label,
  description,
  header,
  children,
  onCloseAutoFocus,
  initialFocus,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  description: string;
  header: React.ReactNode;
  children: React.ReactNode;
  onCloseAutoFocus?: (e: Event) => void;
  /** Açılınca odaklanacak öğe (ör. donanım klavyesiyle Ctrl+D → doğal yazım alanı). */
  initialFocus?: () => HTMLElement | null;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-todo-esc=""
        aria-label={label}
        onOpenAutoFocus={(e) => {
          // Ekran klavyesi kendiliğinden açılmasın: odak sayfanın kendisine.
          e.preventDefault();
          const target = initialFocus?.() ?? (e.currentTarget as HTMLElement | null);
          target?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(
          "max-h-[92dvh] gap-2.5 overflow-y-auto rounded-t-[20px] bg-surface px-4 pt-1.5 pb-[max(24px,env(safe-area-inset-bottom))] outline-none",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Kapat"
          className="mx-auto flex h-6 w-16 shrink-0 items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        </button>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {header}
        {children}
      </SheetContent>
    </Sheet>
  );
}

function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      className="h-11 shrink-0 px-3 text-[15px] text-primary"
      onClick={onClick}
    >
      Bitti
    </Button>
  );
}

/** Mobil tarih sayfası başlığı (MTodoDate): "Tarih", görev adı, Bitti. */
export function DateSheetHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      <SheetTitle className="m-0 text-lg font-semibold">Tarih</SheetTitle>
      <span className="min-w-0 truncate rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
        {title.trim() || "Adsız görev"}
      </span>
      <span className="flex-1" />
      <DoneButton onClick={onDone} />
    </div>
  );
}

/** Mobil kişi sayfası başlığı (MTodoWho): "Kişiye ata", görev adı, Bitti. */
export function WhoSheetHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      <SheetTitle className="m-0 text-lg font-semibold">Kişiye ata</SheetTitle>
      <span className="min-w-0 truncate rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
        {title.trim() || "Adsız görev"}
      </span>
      <span className="flex-1" />
      <DoneButton onClick={onDone} />
    </div>
  );
}

/**
 * Mobil görev ayrıntısı (MTodoDetail): kutucuk ve başlık, açıklama, tarih çipi, alt
 * görevler ("Alt görevler · 1/3"), "Alt görev ekle", "Görevi sil".
 */
export function TaskDetailSheet({
  open,
  task,
  tasks,
  today,
  onOpenChange,
  onToggleDone,
  onDescription,
  onOpenDate,
  onAddChild,
  onDelete,
  onCloseAutoFocus,
  people,
  readOnly = false,
}: {
  people?: DetailPeople;
  readOnly?: boolean;
  open: boolean;
  task: Task | null;
  tasks: readonly Task[];
  today: string;
  onOpenChange: (open: boolean) => void;
  onToggleDone: (id: string) => void;
  onDescription: (id: string, html: string) => void;
  onOpenDate: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const kids = task ? childrenOf(tasks, task.id) : [];
  const counts = task ? childCounts(tasks, task.id) : null;
  return (
    <TodoSheet
      open={open && task !== null}
      onOpenChange={onOpenChange}
      label={task ? `${task.title.trim() || "Adsız görev"}: ayrıntılar` : "Görev ayrıntıları"}
      description="Açıklama, tarih ve alt görevler; değişiklikler hemen kaydedilir."
      onCloseAutoFocus={onCloseAutoFocus}
      className="gap-3.5"
      header={
        task && (
          <div className="flex min-h-11 items-center gap-3">
            {!readOnly && (
              <input
                type="checkbox"
                className="task-cb"
                checked={isDone(task)}
                onChange={() => onToggleDone(task.id)}
                aria-label={checkboxLabel(task.title)}
              />
            )}
            <SheetTitle className="m-0 min-w-0 flex-1 truncate text-lg font-semibold">
              {task.title.trim() || "Adsız görev"}
            </SheetTitle>
            <DoneButton onClick={() => onOpenChange(false)} />
          </div>
        )
      }
    >
      {task && (
        <>
          <div className="rounded-[10px] border border-line px-3 py-2">
            <DescriptionEditor
              task={task}
              focusOnOpen={false}
              onDescription={(html) => onDescription(task.id, html)}
              className="text-[15px]"
              editable={!readOnly}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <DateChip
              task={task}
              today={today}
              onClick={() => onOpenDate(task.id)}
              large
              disabled={readOnly}
            />
            {people && (
              <PersonChip
                people={people.assignees}
                onClick={people.onOpenWho}
                large
                disabled={readOnly || !people.canAssign}
              />
            )}
          </div>
          <div className="flex flex-col">
            <h3 className="mx-1.5 mt-0.5 mb-1 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
              Alt görevler{counts && counts.total > 0 ? ` · ${counts.label}` : ""}
            </h3>
            {kids.map((k) => (
              <div
                key={k.id}
                className="flex min-h-11 items-center gap-3 px-1.5"
                data-done={isDone(k) ? "" : undefined}
              >
                {readOnly ? (
                  <span
                    className="mx-[5px] size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <input
                    type="checkbox"
                    className="task-cb"
                    checked={isDone(k)}
                    onChange={() => onToggleDone(k.id)}
                    aria-label={checkboxLabel(k.title)}
                  />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[15px]",
                    isDone(k) && "text-muted-foreground line-through",
                  )}
                >
                  {k.title.trim() || "Adsız görev"}
                </span>
                {childrenOf(tasks, k.id).length > 0 && (
                  <span className="shrink-0 rounded-full bg-line px-[7px] py-0.5 text-xs text-muted-foreground">
                    {childrenOf(tasks, k.id).length} alt görev
                  </span>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onAddChild(task.id)}
                className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-1.5 text-[15px] font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5"
              >
                <Plus aria-hidden="true" />
                Alt görev ekle
              </button>
            )}
          </div>
          {!readOnly && (
            <>
              <div className="h-px bg-line" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-1.5 text-[15px] font-medium text-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5"
              >
                <Trash2 aria-hidden="true" />
                <span className="flex-1 text-left">Görevi sil</span>
                <small className="text-[13px] font-normal text-muted-foreground">
                  alt görevleriyle · Geri al
                </small>
              </button>
            </>
          )}
        </>
      )}
    </TodoSheet>
  );
}
