import { Calendar, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { cn } from "cn";
import { NoteEditorContent, useNoteEditor } from "~/components/notes/note-editor";
import { formatChip, isOverdue } from "~/domain/tasks/dates";
import { isDone, type Task } from "~/domain/tasks/model";
import { PersonChip, type Assignable } from "./person-picker";

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
  disabled,
}: {
  task: Task;
  today: string;
  onClick: () => void;
  large?: boolean;
  disabled?: boolean;
}) {
  const chip = dateChipText(task, today);
  const overdue = isOverdue(task.dueDate, today, isDone(task));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={chip.aria}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line pr-2.5 pl-2 text-[13px] font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg]:size-[15px] [&_svg]:text-muted-foreground",
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

/** Ayrıntıdaki kişi çipi (yalnızca proje notunda). */
export type DetailPeople = {
  assignees: readonly Assignable[];
  canAssign: boolean;
  onOpenWho: () => void;
};

export type TaskDetailProps = {
  task: Task;
  today: string;
  focusOnOpen: boolean;
  people?: DetailPeople;
  /** Görüntüleyici: açıklama ve çipler salt okunur; alt görev ekleme ve silme yok. */
  readOnly?: boolean;
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
  editable = true,
}: {
  task: Task;
  focusOnOpen: boolean;
  onDescription: (html: string) => void;
  className?: string;
  editable?: boolean;
}) {
  const editor = useNoteEditor({
    initialHtml: task.description,
    editable,
    onChange: onDescription,
    label: "Açıklama",
    placeholder: editable ? "Açıklama ekle" : "Açıklama yok",
    className: cn("min-h-[52px] py-1 text-[14px] leading-normal", className),
  });
  useEffect(() => {
    if (focusOnOpen && editable && editor) editor.commands.focus("end");
  }, [focusOnOpen, editable, editor]);
  return <NoteEditorContent editor={editor} />;
}

/**
 * Görev ayrıntısı akordeonu (satırın hemen altında): açıklama, tarih çipi, "Alt görev
 * ekle" ve görevi silme. Kişi çipi yalnızca proje notunda. Esc kapatır, odak satıra
 * döner. Görüntüleyicide salt okunur.
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
  people,
  readOnly = false,
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
      <DescriptionEditor
        task={task}
        focusOnOpen={focusOnOpen}
        onDescription={onDescription}
        editable={!readOnly}
      />
      <div className="flex flex-wrap items-center gap-2">
        <DateChip task={task} today={today} onClick={onOpenDate} disabled={readOnly} />
        {people && (
          <PersonChip
            people={people.assignees}
            onClick={people.onOpenWho}
            disabled={readOnly || !people.canAssign}
          />
        )}
      </div>
      {!readOnly && (
        <>
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
        </>
      )}
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
