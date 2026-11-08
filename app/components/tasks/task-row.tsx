import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  Check,
  ChevronRight,
  GripVertical,
  TextAlignStart,
  UserRound,
} from "lucide-react";
import { memo } from "react";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { SORT_TRANSITION } from "~/components/drag-motion";
import { taskFocusLabel } from "~/domain/realtime/live-ui";
import type { Peer } from "~/domain/realtime/presence";
import { formatRange, isOverdue } from "~/domain/tasks/dates";
import { isDone } from "~/domain/tasks/model";
import type { TaskRow as TaskRowData } from "~/domain/tasks/tree";
import { AssigneeAvatars, type Assignable } from "./person-picker";

export const EMPTY_ROW_PLACEHOLDER = "Görev yaz · Enter yeni görev · Tab alt görev";

/** Satır girintisi (px / seviye). Mobilde 3. seviyeden sonra sabitlenir (PLAN §3). */
export const INDENT = 28;
export const MOBILE_INDENT = 24;
export const MOBILE_MAX_DEPTH = 3;

export function rowIndent(depth: number, mobile: boolean) {
  return mobile ? Math.min(depth, MOBILE_MAX_DEPTH) * MOBILE_INDENT : depth * INDENT;
}

export const checkboxLabel = (title: string) =>
  `${title.trim() || "Adsız görev"} tamamlandı olarak işaretle`;

export type TaskRowProps = {
  row: TaskRowData;
  today: string;
  focused: boolean;
  mobile: boolean;
  coarse: boolean;
  detailOpen: boolean;
  pickerOpen: boolean;
  /** Tamamlandı, 1,2 sn yerinde; "leave" son anda gruba iniş; "landed" grupta yerine oturma. */
  settle: "stay" | "leave" | "landed" | null;
  blocked: boolean;
  /** Sürüklenirken tahmin edilen seviye (yalnızca sürüklenen satır). */
  projectedDepth: number | null;
  sortable: boolean;
  onToggleExpand: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTitle: (id: string, title: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, id: string) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string, e: React.FocusEvent) => void;
  onOpenDate: (id: string) => void;
  onOpenDetail: (id: string) => void;
  /** Proje notu: atananlar (sessiz ipucu avatarları). */
  assignees?: readonly Assignable[];
  /** Kişi simgesi (proje notunda, yönetici / düzenleyici). */
  canAssign?: boolean;
  whoOpen?: boolean;
  onOpenWho?: (id: string) => void;
  /** Görüntüleyici: kutucuk yerine madde işareti, başlık salt okunur, araç simgesi yok. */
  readOnly?: boolean;
  /** Bu göreve odaklanmış diğer kişiler (varlık; `peersOnTask`). */
  focusPeers?: readonly Peer[];
  children?: React.ReactNode;
};

const HOV =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-line hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary pointer-coarse:h-11 pointer-coarse:w-10 pointer-coarse:opacity-50 [&_svg]:size-[17px] pointer-coarse:[&_svg]:size-[18px]";

/**
 * Görev satırı (prototip TodoNote `.row`): tutamak, alt görev oku, kutucuk, tek satırlık
 * başlık, sessiz ipuçları (1/3, tarih / Bugün / gecikmiş) ve üzerine gelince ya da
 * odakta beliren takvim ve "Ayrıntılar" simgeleri. Dokunmatikte simgeler hep soluk
 * görünür; kişi simgesi ve atanan avatarları yalnızca proje notunda. Görüntüleyicide
 * kutucuk yerine madde işareti (States2 → Görüntüleyici).
 */
export const TaskRow = memo(function TaskRow({
  row,
  today,
  focused,
  mobile,
  detailOpen,
  pickerOpen,
  settle,
  blocked,
  projectedDepth,
  sortable,
  onToggleExpand,
  onToggleDone,
  onTitle,
  onKeyDown,
  onFocus,
  onBlur,
  onOpenDate,
  onOpenDetail,
  assignees,
  canAssign = false,
  whoOpen = false,
  onOpenWho,
  readOnly = false,
  focusPeers,
  children,
}: TaskRowProps) {
  const { task, id, depth } = row;
  const done = isDone(task);
  const range = formatRange(task.startDate, task.dueDate, today);
  const overdue = isOverdue(task.dueDate, today, done);
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled: !sortable,
    transition: SORT_TRANSITION,
  });
  const shownDepth = isDragging && projectedDepth !== null ? projectedDepth : depth;
  const deep = mobile && depth > MOBILE_MAX_DEPTH;

  return (
    <div
      ref={setNodeRef}
      data-task-row={id}
      data-depth={depth}
      data-done={done ? "" : undefined}
      className={cn(
        "relative",
        depth > 0 && settle === null && "task-enter",
        settle === "leave" && "task-leave",
        settle === "landed" && "task-landed",
        isDragging && "z-[2] opacity-60",
      )}
      style={{
        paddingLeft: rowIndent(shownDepth, mobile),
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      {...(sortable ? listeners : {})}
    >
      {deep && (
        <span
          className="absolute top-1.5 bottom-1.5 w-0.5 rounded-full bg-line"
          style={{ left: rowIndent(depth, mobile) - 8 }}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "task-line group/row flex min-h-[38px] items-center gap-1.5 rounded-lg py-0.5 pr-2 pl-1 focus-within:bg-hover focus-within:shadow-[inset_2px_0_0_var(--accent)] hover:bg-hover",
          "pointer-coarse:min-h-11 pointer-coarse:gap-0.5 pointer-coarse:py-0 pointer-coarse:pr-0 pointer-coarse:pl-0.5",
          detailOpen && "bg-hover",
          blocked && "task-nodel",
          focusPeers?.length && "relative",
        )}
      >
        {focusPeers && focusPeers.length > 0 && (
          <span
            className="task-peer-bar pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full"
            style={{ background: focusPeers[0]!.color }}
            aria-hidden="true"
          />
        )}
        <span
          data-drag-handle=""
          className={cn(
            "inline-flex w-3.5 shrink-0 cursor-grab justify-center text-muted-foreground opacity-0 group-hover/row:opacity-70 pointer-coarse:hidden [&_svg]:size-3.5",
            readOnly && "invisible",
          )}
          aria-hidden="true"
        >
          <GripVertical />
        </span>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onToggleExpand(id)}
          aria-label="Alt görevleri aç veya kapat"
          aria-expanded={row.hasChildren ? row.expanded : undefined}
          className={cn(
            "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-line hover:text-fg pointer-coarse:h-11 pointer-coarse:w-7",
            !row.hasChildren && "invisible",
          )}
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform duration-(--dur-small) ease-(--ease-out) reduced-motion:transition-none",
              row.expanded && "rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        {readOnly ? (
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-10">
            {done ? (
              <span
                role="img"
                aria-label="tamamlandı"
                className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-muted-foreground/70 text-surface"
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
            ) : (
              <span
                className="size-2 rounded-full border-[1.5px] border-muted-foreground"
                aria-hidden="true"
              />
            )}
          </span>
        ) : (
          <label className="inline-flex shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-10">
            <input
              type="checkbox"
              className="task-cb"
              checked={done}
              onChange={() => onToggleDone(id)}
              aria-label={checkboxLabel(task.title)}
            />
          </label>
        )}
        <input
          data-task-input={id}
          className="task-title h-[30px] min-w-20 flex-1 border-0 bg-transparent px-1.5 text-[15px] outline-none placeholder:text-muted-foreground pointer-coarse:h-10 pointer-coarse:px-1"
          value={task.title}
          placeholder={readOnly ? "" : focused && !task.title ? EMPTY_ROW_PLACEHOLDER : "Görev"}
          aria-label="Görev başlığı"
          readOnly={readOnly}
          autoComplete="off"
          enterKeyHint="next"
          onChange={(e) => onTitle(id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, id)}
          onFocus={() => onFocus(id)}
          onBlur={(e) => onBlur(id, e)}
        />
        {row.hasChildren && (
          <span
            className="shrink-0 rounded-full bg-line px-[7px] py-0.5 text-xs whitespace-nowrap text-muted-foreground"
            title={`${row.counts.label} alt görev tamamlandı`}
          >
            {row.counts.label}
            <span className="sr-only"> alt görev tamamlandı</span>
          </span>
        )}
        {range && (
          <span
            className={cn(
              "shrink-0 rounded-full px-[7px] py-0.5 text-xs whitespace-nowrap",
              overdue ? "bg-danger-soft font-medium text-danger" : "bg-line text-muted-foreground",
            )}
          >
            {overdue && <span className="sr-only">Gecikmiş: </span>}
            {range}
          </span>
        )}
        {focusPeers && focusPeers.length > 0 && <TaskFocusPeers peers={focusPeers} />}
        {assignees && assignees.length > 0 && (
          <AssigneeAvatars people={assignees} className="[--row-ring:var(--surface)]" />
        )}
        {!readOnly && (
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              HOV,
              pickerOpen && "opacity-100 pointer-coarse:text-primary pointer-coarse:opacity-100",
            )}
            onClick={() => onOpenDate(id)}
            aria-label="Tarih ver"
            title="Tarih (Ctrl+D)"
            aria-expanded={pickerOpen}
          >
            <Calendar aria-hidden="true" />
          </button>
        )}
        {canAssign && !readOnly && (
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              HOV,
              // Dokunmatikte satır dar: kişi seçici araç çubuğundan ve ayrıntıdan açılır.
              "pointer-coarse:hidden",
              whoOpen && "opacity-100",
            )}
            onClick={() => onOpenWho?.(id)}
            aria-label="Kişiye ata"
            title="Kişiye ata (Ctrl+Shift+A)"
            aria-expanded={whoOpen}
          >
            <UserRound aria-hidden="true" />
          </button>
        )}
        {/* Görüntüleyicide ayrıntı yalnızca açıklama varsa (okumak için). */}
        {(!readOnly || task.description) && (
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              HOV,
              detailOpen && "opacity-100 pointer-coarse:text-primary pointer-coarse:opacity-100",
            )}
            onClick={() => onOpenDetail(id)}
            aria-label="Ayrıntılar"
            title="Ayrıntılar (Shift+Enter)"
            aria-expanded={detailOpen}
          >
            <TextAlignStart aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
});

/**
 * Görevdeki diğer kişiler: kişinin renginde halkalı küçük avatar (atanan avatarlarından
 * halkasıyla ayrılır) ve satırın solunda aynı renkte ince çizgi.
 */
function TaskFocusPeers({ peers }: { peers: readonly Peer[] }) {
  const label = taskFocusLabel(peers);
  const shown = peers.slice(0, 2);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="gorevde-kisi"
      className="inline-flex shrink-0 items-center"
    >
      {shown.map((p, i) => (
        <span
          key={p.userId}
          className={cn("inline-flex rounded-full p-px", i > 0 && "-ml-1.5")}
          style={{ boxShadow: `0 0 0 2px ${p.color}` }}
        >
          <Avatar name={p.name} color={p.color} src={p.avatarUrl} size={18} />
        </span>
      ))}
      {peers.length > shown.length && (
        <span className="ml-0.5 text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
          +{peers.length - shown.length}
        </span>
      )}
    </span>
  );
}
