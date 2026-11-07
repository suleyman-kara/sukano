import { Calendar, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { cn } from "cn";
import { NoteEditorContent, useNoteEditor } from "~/components/notes/note-editor";
import { formatChip, isOverdue } from "~/domain/tasks/dates";
import { isDone, type Task } from "~/domain/tasks/model";

/** Tarih çipinin metni ve erişilebilir adı (prototip `dateChip`). */
export function dateChipText(task: Task, today: string) {
  const chip = formatChip(task.startDate, task.dueDate, task.dueTime, today);
  return { text: chip || "Tarih", aria: chip ? `Tarih: ${chip}` : "Tarih ver", set: Boolean(chip) };
}

export function DateChip({
  task,
  today,
  onClick,
  large,
}: {
  task: Task;
  today: string;
  onClick: () => void;
  large?: boolean;
}) {
  const chip = dateChipText(task, today);
  const overdue = isOverdue(task.dueDate, today, isDone(task));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={chip.aria}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line pr-2.5 pl-2 text-[13px] font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[15px] [&_svg]:text-muted-foreground",
        large ? "h-11" : "h-[30px]",
        chip.set && "border-transparent bg-primary-soft text-primary [&_svg]:text-primary",
        overdue && "border-transparent bg-danger-soft text-danger [&_svg]:text-danger",
      )}
    >
      <Calendar aria-hidden="true" />
      {chip.text}
    </button>
  );
}

export type TaskDetailProps = {
  task: Task;
  today: string;
  focusOnOpen: boolean;
  onDescription: (html: string) => void;
  onOpenDate: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Açıklama düzenleyicisi (Tiptap, hafif biçimlendirme; Markdown kısayolları). */
export function DescriptionEditor({
  task,
  focusOnOpen,
  onDescription,
  className,
}: {
  task: Task;
  focusOnOpen: boolean;
  onDescription: (html: string) => void;
  className?: string;
}) {
  const editor = useNoteEditor({
    initialHtml: task.description,
    onChange: onDescription,
    label: "Açıklama",
    placeholder: "Açıklama ekle",
    className: cn("min-h-[52px] py-1 text-[14px] leading-normal", className),
  });
  useEffect(() => {
    if (focusOnOpen && editor) editor.commands.focus("end");
  }, [focusOnOpen, editor]);
  return <NoteEditorContent editor={editor} />;
}

/**
 * Görev ayrıntısı akordeonu (satırın hemen altında): açıklama, tarih çipi, "Alt görev
 * ekle" ve görevi silme. Kişi çipi yalnızca proje notunda (Aşama 3). Esc kapatır,
 * odak satıra döner.
 */
export function TaskDetail({
  task,
  today,
  focusOnOpen,
  onDescription,
  onOpenDate,
  onAddChild,
  onDelete,
  onClose,
}: TaskDetailProps) {
  return (
    // Esc, açıklama düzenleyicisinden ve düğmelerden kabarcıkla gelir.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      data-todo-esc=""
      role="group"
      aria-label={`${task.title.trim() || "Adsız görev"}: ayrıntılar`}
      className="mr-2 mb-2.5 ml-9 flex flex-col gap-2.5 border-l-2 border-line pt-2 pr-3 pb-3 pl-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <DescriptionEditor task={task} focusOnOpen={focusOnOpen} onDescription={onDescription} />
      <div className="flex flex-wrap items-center gap-2">
        <DateChip task={task} today={today} onClick={onOpenDate} />
      </div>
      <button
        type="button"
        onClick={onAddChild}
        className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
      >
        <Plus aria-hidden="true" />
        Alt görev ekle
      </button>
      <div className="h-px bg-line" aria-hidden="true" />
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-danger outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
      >
        <Trash2 aria-hidden="true" />
        Görevi sil
        <small className="text-xs font-normal text-muted-foreground">
          alt görevleriyle birlikte · geri alınabilir
        </small>
      </button>
    </div>
  );
}

/** "Tamamlananlar (n)" daraltılabilir grup başlığı. */
export function DoneGroupHeader({
  count,
  open,
  indent,
  onToggle,
}: {
  count: number;
  open: boolean;
  /** Seviyenin girintisi (px). */
  indent: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-[13px] font-medium text-muted-foreground outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
      style={{ paddingLeft: 8 + indent + 36 }}
    >
      <ChevronRight
        className={cn(
          "size-4 transition-transform duration-150 reduced-motion:transition-none",
          open && "rotate-90",
        )}
        aria-hidden="true"
      />
      Tamamlananlar ({count})
    </button>
  );
}
