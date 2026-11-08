import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "cn";
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover";
import { TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import type { Peer } from "~/domain/realtime/presence";
import { clearCompleted as clearCompletedTasks } from "~/domain/tasks/completion";
import { fixRange, parseNaturalDate, pickDate, todayIn, type DateSlot } from "~/domain/tasks/dates";
import {
  childrenOf,
  findTask,
  hasChildren,
  isDone,
  subtreeIds,
  type Task,
  type TaskFields,
} from "~/domain/tasks/model";
import {
  appendTask,
  enterKey,
  focusAfterComplete,
  idsWithChildren,
  indent,
  insertChild,
  moveAmongSiblings,
  moveTo,
  outdent,
  remove,
  restoreTasks,
  updateTask,
  visibleRows,
  type TaskRow as TaskRowData,
} from "~/domain/tasks/tree";
import { applyUndo, SETTLE_MS, toggleWithUndo } from "~/domain/tasks/undo";
import { DatePicker } from "./date-picker";
import { PersonList, resolveAssignees, type TodoPeople } from "./person-picker";
import { projectDrop, type DragRow } from "./drag";
import { ShortcutCard } from "./shortcut-card";
import { DoneGroupHeader, TaskDetail } from "./task-detail";
import { checkboxLabel, INDENT, MOBILE_INDENT, rowIndent, TaskRow } from "./task-row";
import { DateSheetHeader, TaskDetailSheet, TodoSheet, WhoSheetHeader } from "./todo-sheets";
import { TodoToasts } from "./todo-toasts";
import { TodoToolbar, useKeyboardInset } from "./todo-toolbar";
import { useTaskViewState } from "./use-task-view-state";
import { useTodoTasks, type LiveTaskSource } from "./use-todo-tasks";
import type { TaskReminderControl } from "~/components/reminders/use-reminders";
import { useTodoUndo } from "./use-todo-undo";

export const COARSE_QUERY = "(pointer: coarse)";
/** Satırın gruba inişi (SETTLE_MS'in son anı): large, ease-in-out (MicroMotion 1). */
const LEAVE_MS = 320;
const BLOCK_MS = 600;

const newId = () => crypto.randomUUID();

/**
 * Esc'yi yapılacaklar editörü mü karşılıyor? (Görev satırı, ayrıntı, seçici, araç
 * çubuğu, alttan açılan sayfalar.) Not diyaloğu bu durumda kapanmaz; Esc katmanlıdır.
 */
export function editorHandlesEscape(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-task-input], [data-todo-esc]"));
}

export type TodoEditorHandle = {
  expandAll: () => void;
  collapseAll: () => void;
  clearCompleted: () => void;
  toggleHelp: () => void;
  /** Bekleyen görev işlemleri sunucuya ulaşınca çözülür. */
  flush: () => Promise<void>;
};

type Picker = {
  id: string;
  /** Klavyeyle açıldı (Ctrl+D): mobil sayfada da odak doğal yazım alanına. */
  viaKeyboard?: boolean;
  slot: DateSlot;
  timeOpen: boolean;
  text: string;
  textError: boolean;
  warning: string | null;
};

type Who = { id: string; viaKeyboard: boolean };

type Focus = { id: string; caret: number | "end" } | { el: "add" | "help" };

type Drag = { id: string; overId: string; offsetX: number };

/** Fareyle yalnızca tutamaktan sürüklenir (başlıkta metin seçimi bozulmasın). */
class HandleMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: ({ nativeEvent: e }: React.MouseEvent) =>
        e.button === 0 &&
        e.target instanceof Element &&
        Boolean(e.target.closest("[data-drag-handle]")),
    },
  ];
}

export type TodoEditorProps = {
  noteId: string;
  initialTasks: Task[];
  editable?: boolean;
  /** Kaydırma alanının başı (mobilde başlık). */
  header?: React.ReactNode;
  /** Kaydırma alanının sonu (mobilde "Düzenlendi …"). */
  footer?: React.ReactNode;
  onHelpChange?: (open: boolean) => void;
  ref?: React.Ref<TodoEditorHandle>;
  className?: string;
  /** Proje notu: üyeler ve atama yetkisi (kişisel notta yok: atama arayüzü yok). */
  people?: TodoPeople;
  /** Görev kimliği → atanan kullanıcı kimlikleri. */
  initialAssignees?: Record<string, string[]>;
  /** Canlı görev yayınları (not odası; başka kişilerin yazımları anında gelir). */
  live?: LiveTaskSource | null;
  /** Odaklı görev değişince (varlıkta "şu görevde" bilgisi için). */
  onActiveTaskChange?: (taskId: string | null) => void;
  /** Notu açık tutan diğer kişiler (görev satırında odak göstergesi). */
  peers?: readonly Peer[];
  /** Görevlerin "Hatırlat" anahtarı (tarih seçicide); yoksa anahtar devre dışı. */
  taskReminders?: TaskReminderControl;
};

/**
 * Yapılacaklar notu düzenleyicisi (PLAN §3, §10; prototip docs/design/TodoNote.dc.html).
 * Satırlar `visibleRows`'tan gelir; her düzenleme saf ağaç işlemidir (app/domain/tasks)
 * ve `useTodoTasks` ile hemen gösterilip sunucuya sıralı gönderilir. Klavye akışı
 * yalnızca editörün içindedir (genel keydown dinleyicisi yok).
 */
export function TodoEditor({
  noteId,
  initialTasks,
  editable = true,
  header,
  footer,
  onHelpChange,
  ref,
  className,
  people,
  initialAssignees,
  live,
  onActiveTaskChange,
  peers,
  taskReminders,
}: TodoEditorProps) {
  const { tasks, apply, current, whenIdle, assignees, assign } = useTodoTasks(
    noteId,
    initialTasks,
    initialAssignees,
    live,
  );
  const canAssign = editable && Boolean(people?.canAssign);
  // Görev → o göreve odaklanmış kişiler (satır `memo`'su bozulmasın diye kararlı diziler).
  const focusPeers = useMemo(() => {
    const map = new Map<string, Peer[]>();
    for (const p of peers ?? [])
      for (const id of p.focusTaskIds) map.set(id, [...(map.get(id) ?? []), p]);
    return map;
  }, [peers]);
  const view = useTaskViewState(noteId);
  const coarse = useMediaQuery(COARSE_QUERY, false);
  const mobile = !useMediaQuery(TABLET_UP_QUERY, true);
  const tablet = coarse && !mobile;
  const today = todayIn();

  const [detail, setDetail] = useState<{ id: string; focus: boolean } | null>(null);
  const [picker, setPickerState] = useState<Picker | null>(null);
  const [who, setWhoState] = useState<Who | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeChange = useRef(onActiveTaskChange);
  useEffect(() => {
    activeChange.current = onActiveTaskChange;
  });
  useEffect(() => activeChange.current?.(activeId), [activeId]);
  const [help, setHelpState] = useState(false);
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  /** Tamamlananlar grubuna yeni inen satırlar (iniş animasyonunun ikinci yarısı). */
  const [landed, setLanded] = useState<ReadonlySet<string>>(() => new Set());
  const settlingRef = useRef(settling);
  useEffect(() => {
    settlingRef.current = settling;
  }, [settling]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, setTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<Focus | null>(null);
  const pickerReturn = useRef<string | null>(null);
  const whoReturn = useRef<string | null>(null);
  const whoRef = useRef<Who | null>(null);
  const helpReturn = useRef<string | null>(null);
  const detailReturn = useRef<string | null>(null);
  const settleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<Picker | null>(null);
  const detailRef = useRef(detail);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    pickerRef.current = picker;
    detailRef.current = detail;
    viewRef.current = view;
  });

  const setPicker = useCallback((p: Picker | null | ((p: Picker | null) => Picker | null)) => {
    setPickerState((old) => {
      const next = typeof p === "function" ? p(old) : p;
      pickerRef.current = next;
      return next;
    });
  }, []);

  const setWho = useCallback((w: Who | null) => {
    whoRef.current = w;
    setWhoState(w);
  }, []);

  const setHelp = useCallback(
    (open: boolean) => {
      setHelpState(open);
      onHelpChange?.(open);
    },
    [onHelpChange],
  );

  /* -------------------------------------------------------------- */
  /* Odak                                                            */
  /* -------------------------------------------------------------- */

  const inputOf = (id: string) =>
    rootRef.current?.querySelector<HTMLInputElement>(
      `[data-task-input="${id.replace(/"/g, '\\"')}"]`,
    ) ?? null;

  const focusRow = useCallback((id: string, caret: number | "end" = "end") => {
    pending.current = { id, caret };
    setTick((t) => t + 1);
  }, []);
  const focusAdd = useCallback(() => {
    pending.current = { el: "add" };
    setTick((t) => t + 1);
  }, []);

  useLayoutEffect(() => {
    const f = pending.current;
    if (!f) return;
    pending.current = null;
    if ("el" in f) {
      addRef.current?.focus();
      return;
    }
    const el = inputOf(f.id);
    if (!el) return;
    el.focus();
    const n = f.caret === "end" ? el.value.length : Math.min(f.caret, el.value.length);
    try {
      el.setSelectionRange(n, n);
    } catch {
      /* bazı giriş türleri seçim desteklemez */
    }
  });

  /* -------------------------------------------------------------- */
  /* Tamamlama ve geri al                                            */
  /* -------------------------------------------------------------- */

  const clearSettleTimers = () => {
    settleTimers.current.forEach(clearTimeout);
    settleTimers.current = [];
  };
  useEffect(
    () => () => {
      settleTimers.current.forEach(clearTimeout);
      if (blockTimer.current) clearTimeout(blockTimer.current);
    },
    [],
  );

  const settle = useCallback((ids: string[]) => {
    clearSettleTimers();
    setLeaving(new Set());
    setSettling((s) => new Set([...s, ...ids]));
    settleTimers.current.push(
      setTimeout(() => setLeaving(new Set(["*"])), SETTLE_MS - LEAVE_MS),
      setTimeout(() => {
        setLanded(settlingRef.current);
        setSettling(new Set());
        setLeaving(new Set());
      }, SETTLE_MS),
      setTimeout(() => setLanded(new Set()), SETTLE_MS + LEAVE_MS + 60),
    );
  }, []);

  const unsettle = useCallback((ids: readonly string[]) => {
    setSettling((s) => {
      if (!ids.some((i) => s.has(i))) return s;
      const next = new Set(s);
      ids.forEach((i) => next.delete(i));
      return next;
    });
  }, []);

  const undo = useTodoUndo({
    onReopen: (ids) => {
      const r = applyUndo(current(), ids);
      apply({ tasks: r.tasks, ops: r.ops });
      unsettle(ids);
      if (ids[0] && findTask(current(), ids[0])) focusRow(ids[0], "end");
    },
    onRestore: (removed) => apply(restoreTasks(current(), removed)),
  });

  const rows = useMemo(
    () => visibleRows(tasks, view.expanded, view.doneOpen, settling),
    [tasks, view.expanded, view.doneOpen, settling],
  );
  const visibleIds = useMemo(() => rows.flatMap((r) => (r.kind === "task" ? [r.id] : [])), [rows]);
  const visibleRef = useRef(visibleIds);
  useLayoutEffect(() => {
    visibleRef.current = visibleIds;
  });

  const toggleDone = useCallback(
    (id: string, fromKey = false) => {
      const list = current();
      const r = toggleWithUndo(list, undo.current(), id, Date.now(), "");
      if (!r) return;
      apply({ tasks: r.result.tasks, ops: r.result.ops });
      undo.afterToggle(r.undo, r.toastKey);
      if (r.result.completed) {
        settle(r.result.changed);
        if (fromKey) {
          const next = focusAfterComplete(list, visibleRef.current, id, r.result.changed);
          if (next) focusRow(next, "end");
          else focusAdd();
        }
      } else {
        unsettle(r.result.changed);
      }
    },
    [apply, current, undo, settle, unsettle, focusRow, focusAdd],
  );

  /* -------------------------------------------------------------- */
  /* Ağaç işlemleri                                                  */
  /* -------------------------------------------------------------- */

  const update = useCallback(
    (id: string, fields: Partial<TaskFields>) => apply(updateTask(current(), id, fields)),
    [apply, current],
  );

  const onTitle = useCallback(
    (id: string, title: string) => {
      update(id, { title });
      undo.typing();
    },
    [update, undo],
  );

  const indentRow = useCallback(
    (id: string) => {
      const r = indent(current(), id);
      if (!r) return;
      apply(r);
      viewRef.current.setOpen(r.expand, true);
      focusRow(id, "end");
    },
    [apply, current, focusRow],
  );

  const outdentRow = useCallback(
    (id: string) => {
      if (!apply(outdent(current(), id))) return;
      focusRow(id, "end");
    },
    [apply, current, focusRow],
  );

  const moveRow = useCallback(
    (id: string, dir: -1 | 1) => {
      if (!apply(moveAmongSiblings(current(), id, dir))) return;
      focusRow(id, "end");
    },
    [apply, current, focusRow],
  );

  const shake = useCallback((id: string) => {
    if (blockTimer.current) clearTimeout(blockTimer.current);
    setBlocked(id);
    blockTimer.current = setTimeout(() => setBlocked(null), BLOCK_MS);
  }, []);

  const addTop = useCallback(() => {
    const r = appendTask(current(), newId());
    apply(r);
    focusRow(r.focusId, 0);
  }, [apply, current, focusRow]);

  const addChild = useCallback(
    (id: string) => {
      const r = insertChild(current(), id, newId());
      if (!r) return;
      apply(r);
      viewRef.current.setOpen(r.expand, true);
      setDetail(null);
      focusRow(r.focusId, 0);
    },
    [apply, current, focusRow],
  );

  const deleteTask = useCallback(
    (id: string) => {
      const t = findTask(current(), id);
      const r = remove(current(), id, { withSubtree: true });
      if (!t || !r) return;
      apply(r);
      setDetail(null);
      undo.pushRestore(`${t.title.trim() || "Adsız görev"} silindi`, r.removed);
      focusAdd();
    },
    [apply, current, undo, focusAdd],
  );

  const clearDone = useCallback(() => {
    const r = clearCompletedTasks(current());
    if (r.removed.length === 0) return;
    apply(r);
    undo.pushRestore(`${r.removed.length} tamamlanan görev silindi`, r.removed);
  }, [apply, current, undo]);

  useImperativeHandle(
    ref,
    () => ({
      expandAll: () => viewRef.current.setExpanded(idsWithChildren(current())),
      collapseAll: () => viewRef.current.setExpanded([]),
      clearCompleted: clearDone,
      toggleHelp: () => {
        helpReturn.current = null;
        setHelp(!help);
      },
      flush: whenIdle,
    }),
    [clearDone, help, setHelp, current, whenIdle],
  );

  /* -------------------------------------------------------------- */
  /* Tarih seçici                                                    */
  /* -------------------------------------------------------------- */

  const openPicker = useCallback(
    (id: string) => {
      setWho(null);
      setPicker((p) =>
        p?.id === id
          ? null
          : { id, slot: "due", timeOpen: false, text: "", textError: false, warning: null },
      );
    },
    [setPicker, setWho],
  );

  const closePickerToRow = useCallback(() => {
    const p = pickerRef.current;
    if (!p) return;
    // Odak hemen satıra döner; kapanış animasyonu bitince ikinci kez taşınmaz.
    pickerReturn.current = null;
    setPicker(null);
    focusRow(p.id, "end");
  }, [setPicker, focusRow]);

  const pick = useCallback(
    (date: string, extra: Partial<TaskFields> = {}) => {
      const p = pickerRef.current;
      const t = p && findTask(current(), p.id);
      if (!p || !t) return null;
      const r = pickDate({ startDate: t.startDate, dueDate: t.dueDate }, p.slot, date);
      update(p.id, { startDate: r.startDate, dueDate: r.dueDate, ...extra });
      setPicker({ ...p, slot: "due", warning: r.warning, text: "", textError: false });
      return r;
    },
    [current, update, setPicker],
  );

  const submitText = useCallback(
    (text: string) => {
      const p = pickerRef.current;
      if (!p) return;
      const parsed = parseNaturalDate(text, today);
      if (!parsed) {
        setPicker({ ...p, text, textError: true });
        return;
      }
      const r = pick(parsed.date, parsed.time && p.slot === "due" ? { dueTime: parsed.time } : {});
      // Bitiş yazıldıysa ve uyarı yoksa seçici kapanır, odak satıra döner. Başlangıç
      // yazıldıysa seçici açık kalır ve bitiş yuvasına geçer.
      if (r && p.slot === "due" && !r.warning) closePickerToRow();
    },
    [today, pick, setPicker, closePickerToRow],
  );

  const setTime = useCallback(
    (time: string | null) => {
      const p = pickerRef.current;
      const t = p && findTask(current(), p.id);
      if (!p || !t) return;
      if (time && !t.dueDate) {
        update(p.id, { dueTime: time, ...fixRange({ startDate: t.startDate, dueDate: today }) });
        setPicker({ ...p, warning: "Saat için bitiş tarihi bugün olarak ayarlandı." });
      } else {
        update(p.id, { dueTime: time });
        setPicker({ ...p, warning: null });
      }
    },
    [current, update, setPicker, today],
  );

  const clearDates = useCallback(() => {
    const p = pickerRef.current;
    if (!p) return;
    update(p.id, { startDate: null, dueDate: null, dueTime: null });
    closePickerToRow();
  }, [update, closePickerToRow]);

  /* -------------------------------------------------------------- */
  /* Kişi seçici (proje notu)                                        */
  /* -------------------------------------------------------------- */

  const openWho = useCallback(
    (id: string, viaKeyboard = false) => {
      if (!canAssign) return;
      setPicker(null);
      setWho(whoRef.current?.id === id && !viaKeyboard ? null : { id, viaKeyboard });
    },
    [canAssign, setPicker, setWho],
  );

  const assigneesRef = useRef(assignees);
  useLayoutEffect(() => {
    assigneesRef.current = assignees;
  });

  /** Seçimi aç/kapat; liste üye sırasıyla (sen önce) gönderilir. */
  const toggleAssignee = useCallback(
    (userId: string) => {
      const w = whoRef.current;
      if (!w || !people) return;
      const now = new Set(assigneesRef.current[w.id] ?? []);
      if (now.has(userId)) now.delete(userId);
      else now.add(userId);
      assign(
        w.id,
        people.members.filter((m) => now.has(m.id)).map((m) => m.id),
      );
    },
    [assign, people],
  );

  /* -------------------------------------------------------------- */
  /* Ayrıntı                                                         */
  /* -------------------------------------------------------------- */

  const toggleDetail = useCallback(
    (id: string, focus: boolean) => {
      const opening = detailRef.current?.id !== id;
      setDetail(opening ? { id, focus } : null);
      setPicker(null);
      setWho(null);
      if (!opening) focusRow(id, "end");
    },
    [setPicker, setWho, focusRow],
  );

  const closeDetailToRow = useCallback(() => {
    const d = detailRef.current;
    if (!d) return;
    setDetail(null);
    setPicker(null);
    focusRow(d.id, "end");
  }, [setPicker, focusRow]);

  /* -------------------------------------------------------------- */
  /* Klavye                                                          */
  /* -------------------------------------------------------------- */

  const leaveList = useCallback(() => {
    setActiveId(null);
    focusAdd();
  }, [focusAdd]);

  const onRowKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
      const list = current();
      const t = findTask(list, id);
      if (!t) return;
      const el = e.currentTarget;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      const caret = el.selectionStart ?? el.value.length;

      if (mod && k === "/") {
        e.preventDefault();
        helpReturn.current = id;
        setHelp(!help);
        return;
      }
      if (mod && !e.shiftKey && (k === "z" || k === "Z")) {
        if (undo.current().stack.length) {
          e.preventDefault();
          undo.undoLast();
        }
        return;
      }
      // Görüntüleyici: yalnızca gezinme, aç/kapat ve ayrıntı (salt okunur).
      const navKey =
        ((k === "ArrowUp" || k === "ArrowDown") && !e.altKey) ||
        k === "ArrowRight" ||
        k === "ArrowLeft" ||
        k === "Escape" ||
        (k === "Enter" && e.shiftKey && !mod);
      if (!editable && !navKey) return;
      if (k === "Enter") {
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        if (mod) return toggleDone(id, true);
        if (e.shiftKey) return toggleDetail(id, true);
        const r = enterKey(list, id, newId(), caret);
        if (!r) return;
        apply(r);
        focusRow(r.focusId, r.caret);
        return;
      }
      if (k === "Tab") {
        e.preventDefault();
        if (e.shiftKey) outdentRow(id);
        else indentRow(id);
        return;
      }
      if (k === "Backspace" && el.value === "") {
        e.preventDefault();
        if (hasChildren(list, id)) return shake(id);
        const vis = visibleRef.current;
        const prev = vis[vis.indexOf(id) - 1];
        if (!apply(remove(list, id))) return;
        if (detailRef.current?.id === id) setDetail(null);
        if (pickerRef.current?.id === id) setPicker(null);
        if (prev) focusRow(prev, "end");
        else focusAdd();
        return;
      }
      if (k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        const dir = k === "ArrowUp" ? -1 : 1;
        if (e.altKey) return moveRow(id, dir);
        const vis = visibleRef.current;
        const next = vis[vis.indexOf(id) + dir];
        if (next) focusRow(next, caret);
        return;
      }
      if (
        k === "ArrowRight" &&
        caret === el.value.length &&
        el.selectionEnd === caret &&
        hasChildren(list, id) &&
        !viewRef.current.expanded.has(id)
      ) {
        e.preventDefault();
        viewRef.current.setOpen(id, true);
        return;
      }
      if (
        k === "ArrowLeft" &&
        caret === 0 &&
        el.selectionEnd === 0 &&
        viewRef.current.expanded.has(id)
      ) {
        e.preventDefault();
        viewRef.current.setOpen(id, false);
        return;
      }
      if (mod && e.shiftKey && (k === "a" || k === "A")) {
        // Kişi seçici yalnızca proje notunda; kişisel notta tuş hiçbir şey yapmaz.
        e.preventDefault();
        openWho(id, true);
        return;
      }
      if (mod && (k === "d" || k === "D")) {
        e.preventDefault();
        setWho(null);
        setPicker({
          id,
          slot: "due",
          timeOpen: false,
          text: "",
          textError: false,
          warning: null,
          viaKeyboard: true,
        });
        return;
      }
      if (k === "Escape") {
        e.preventDefault();
        if (pickerRef.current) return setPicker(null);
        if (whoRef.current) return setWho(null);
        if (detailRef.current?.id === id) return setDetail(null);
        leaveList();
      }
    },
    [
      current,
      apply,
      editable,
      help,
      setHelp,
      undo,
      toggleDone,
      toggleDetail,
      focusRow,
      focusAdd,
      outdentRow,
      indentRow,
      moveRow,
      shake,
      setPicker,
      setWho,
      openWho,
      leaveList,
    ],
  );

  /** Editör içi (satır dışı): Ctrl+Z son tamamlamayı, Ctrl+/ kısayol kartını açar. */
  const onRootKey = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const typing =
      target.isContentEditable ||
      target.tagName === "TEXTAREA" ||
      (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "checkbox");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "/") {
      e.preventDefault();
      setHelp(!help);
      return;
    }
    if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z") && !typing) {
      if (undo.undoLast()) e.preventDefault();
    }
  };

  const onFocusRow = useCallback((id: string) => {
    setFocusId(id);
    setActiveId(id);
  }, []);

  const onBlurRow = useCallback((id: string) => {
    setFocusId((f) => (f === id ? null : f));
    // Odak satırlardan ve editör katmanlarından çıktıysa araç çubuğu kapanır.
    setTimeout(() => {
      const a = document.activeElement;
      if (a instanceof Element && a.closest("[data-task-input], [data-todo-esc]")) return;
      setActiveId((cur) => (cur === id ? null : cur));
    }, 0);
  }, []);

  /* -------------------------------------------------------------- */
  /* Sürükle-bırak                                                   */
  /* -------------------------------------------------------------- */

  const sensors = useSensors(
    useSensor(HandleMouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );
  const indentPx = mobile ? MOBILE_INDENT : INDENT;
  const dragRows: DragRow[] = useMemo(
    () =>
      rows.flatMap((r) =>
        r.kind === "task" && !isDone(r.task)
          ? [{ id: r.id, parentId: r.task.parentId, depth: r.depth, expanded: r.expanded }]
          : [],
      ),
    [rows],
  );
  const projection = drag
    ? projectDrop(dragRows, drag.id, drag.overId, drag.offsetX, indentPx)
    : null;
  const hiddenWhileDragging = useMemo(
    () => (drag ? new Set(subtreeIds(tasks, drag.id).slice(1)) : null),
    [drag, tasks],
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setDrag({ id, overId: id, offsetX: 0 });
    setDetail(null);
    setPicker(null);
    setWho(null);
  };
  const onDragMove = (e: DragMoveEvent) =>
    setDrag((d) =>
      d ? { ...d, offsetX: e.delta.x, overId: e.over ? String(e.over.id) : d.overId } : d,
    );
  const onDragEnd = (e: DragEndEvent) => {
    const d = drag;
    const target = d
      ? projectDrop(dragRows, d.id, e.over ? String(e.over.id) : d.overId, e.delta.x, indentPx)
      : null;
    setDrag(null);
    if (!d || !target) return;
    if (apply(moveTo(current(), d.id, target.parentId, target.index)) && target.expand) {
      viewRef.current.setOpen(target.expand, true);
    }
  };

  /* -------------------------------------------------------------- */
  /* Çizim                                                           */
  /* -------------------------------------------------------------- */

  const pickerTask = picker ? findTask(tasks, picker.id) : undefined;
  const detailTask = detail ? findTask(tasks, detail.id) : undefined;
  const whoTask = who ? findTask(tasks, who.id) : undefined;
  const assigneesOf = (id: string) =>
    people ? resolveAssignees(assignees[id], people.members) : undefined;
  const detailPeople = (id: string) =>
    people
      ? {
          assignees: assigneesOf(id) ?? [],
          canAssign,
          onOpenWho: () => openWho(id),
        }
      : undefined;
  const activeTask = activeId ? findTask(tasks, activeId) : undefined;
  const showToolbar = coarse && editable && Boolean(activeTask);
  const keyboardInset = useKeyboardInset(showToolbar && mobile);

  // Seçicinin çapası: masaüstünde satır, tablette listenin üstü (TTodo).
  const anchorInfo = useRef({ tablet, pickerId: picker?.id ?? who?.id ?? null });
  useLayoutEffect(() => {
    anchorInfo.current = { tablet, pickerId: picker?.id ?? who?.id ?? null };
  });
  const [anchorRef] = useState(() => ({
    current: {
      getBoundingClientRect: () => {
        const { tablet: onTablet, pickerId } = anchorInfo.current;
        if (onTablet && scrollRef.current) {
          const r = scrollRef.current.getBoundingClientRect();
          return new DOMRect(r.right - 20, r.top + 4, 0, 0);
        }
        const row = pickerId
          ? rootRef.current?.querySelector(`[data-task-row="${pickerId}"] > .task-line`)
          : null;
        return row?.getBoundingClientRect() ?? new DOMRect();
      },
    },
  }));

  const datePicker = pickerTask && picker && (
    <DatePicker
      key={picker.id}
      startDate={pickerTask.startDate}
      dueDate={pickerTask.dueDate}
      dueTime={pickerTask.dueTime}
      today={today}
      slot={picker.slot}
      onSlot={(slot) => setPicker({ ...picker, slot })}
      timeOpen={picker.timeOpen}
      onToggleTime={() => setPicker({ ...picker, timeOpen: !picker.timeOpen })}
      onTime={setTime}
      warning={picker.warning}
      text={picker.text}
      textError={picker.textError}
      onText={(text) => setPicker({ ...picker, text, textError: false })}
      onTextSubmit={submitText}
      onPick={(d) => pick(d)}
      onClear={clearDates}
      textId={`tarih-yaz-${noteId}`}
      variant={mobile ? "sheet" : "popover"}
      remind={taskReminders?.has(pickerTask.id) ?? false}
      remindTo={(assignees[pickerTask.id]?.length ?? 0) > 0 ? "Atananlara gider" : "Sana gider"}
      onRemind={
        taskReminders
          ? (on) => {
              // Bekleyen tarih yazımı sunucuya ulaşsın; hatırlatıcı bitiş tarihinden hesaplanır.
              const id = pickerTask.id;
              void whenIdle().then(() => taskReminders.toggle(id, on));
            }
          : undefined
      }
    />
  );

  return (
    // Editör içi kısayollar (Ctrl+Z, Ctrl+/) alt öğelerden kabarcıkla gelir.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      data-todo-editor=""
      className={cn("relative flex min-h-0 flex-1 flex-col", className)}
      onKeyDown={onRootKey}
    >
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        onScroll={() => {
          if (pickerRef.current && !tablet && !mobile) setPicker(null);
          if (whoRef.current && !tablet && !mobile) setWho(null);
        }}
      >
        {header}
        <div
          className="flex flex-col px-3 pt-1 pb-2 md:pr-3 md:pl-4"
          role="group"
          aria-label="Görevler"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragOver={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDrag(null)}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  "Görevi taşımak için sürükleyin; klavyede Alt ve ok tuşları, girinti için Tab kullanılır.",
              },
              announcements: {
                onDragStart: () => "Görev taşınıyor.",
                onDragOver: () => "",
                onDragMove: () => "",
                onDragEnd: ({ over }) =>
                  over ? "Görev yeni yerine bırakıldı." : "Taşıma iptal edildi.",
                onDragCancel: () => "Taşıma iptal edildi.",
              },
            }}
          >
            <SortableContext
              items={dragRows.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((r) => {
                if (r.kind === "done-header") {
                  return (
                    <DoneGroupHeader
                      key={`h-${r.key}`}
                      count={r.count}
                      open={r.open}
                      indent={rowIndent(r.depth, mobile)}
                      onToggle={() => view.setGroupOpen(r.key)}
                    />
                  );
                }
                if (hiddenWhileDragging?.has(r.id)) return null;
                return (
                  <TaskRow
                    key={r.id}
                    row={r}
                    today={today}
                    focused={focusId === r.id}
                    mobile={mobile}
                    coarse={coarse}
                    detailOpen={detail?.id === r.id}
                    pickerOpen={picker?.id === r.id}
                    settle={
                      settling.has(r.id)
                        ? leaving.size
                          ? "leave"
                          : "stay"
                        : landed.has(r.id)
                          ? "landed"
                          : null
                    }
                    blocked={blocked === r.id}
                    projectedDepth={drag?.id === r.id ? (projection?.depth ?? null) : null}
                    sortable={editable && !isDone(r.task)}
                    onToggleExpand={(id) => view.setOpen(id)}
                    onToggleDone={(id) => toggleDone(id)}
                    onTitle={onTitle}
                    onKeyDown={onRowKey}
                    onFocus={onFocusRow}
                    onBlur={onBlurRow}
                    onOpenDate={openPicker}
                    onOpenDetail={(id) => toggleDetail(id, false)}
                    assignees={assigneesOf(r.id)}
                    canAssign={canAssign}
                    whoOpen={who?.id === r.id}
                    onOpenWho={openWho}
                    readOnly={!editable}
                    focusPeers={focusPeers.get(r.id)}
                  >
                    {!mobile && detail?.id === r.id && (
                      <TaskDetail
                        task={r.task}
                        today={today}
                        focusOnOpen={detail.focus}
                        onDescription={(html) => update(r.id, { description: html })}
                        onOpenDate={() => openPicker(r.id)}
                        onAddChild={() => addChild(r.id)}
                        onDelete={() => deleteTask(r.id)}
                        onClose={closeDetailToRow}
                        people={detailPeople(r.id)}
                        readOnly={!editable}
                      />
                    )}
                  </TaskRow>
                );
              })}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {drag ? (
                <DragGhost
                  row={
                    rows.find((x) => x.kind === "task" && x.id === drag.id) as
                      TaskRowData | undefined
                  }
                />
              ) : null}
            </DragOverlay>
          </DndContext>
          {editable && (
            <button
              ref={addRef}
              type="button"
              onClick={addTop}
              className="flex items-center gap-2.5 rounded-lg py-2 pr-2 pl-11 text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11 pointer-coarse:pl-10 [&_svg]:size-[18px]"
            >
              <Plus aria-hidden="true" />
              Görev ekle
            </button>
          )}
        </div>
        {footer}
      </div>

      {showToolbar && activeTask && (
        <TodoToolbar
          taskTitle={activeTask.title}
          canOutdent={activeTask.parentId !== null}
          canIndent={(() => {
            const sibs = childrenOf(tasks, activeTask.parentId).filter((s) => !isDone(s));
            return !isDone(activeTask) && sibs.findIndex((s) => s.id === activeTask.id) > 0;
          })()}
          canMoveUp={Boolean(moveAmongSiblings(tasks, activeTask.id, -1))}
          canMoveDown={Boolean(moveAmongSiblings(tasks, activeTask.id, 1))}
          dateOpen={picker?.id === activeTask.id}
          detailOpen={detail?.id === activeTask.id}
          showMove={tablet}
          keyboardInset={keyboardInset}
          onOutdent={() => outdentRow(activeTask.id)}
          onIndent={() => indentRow(activeTask.id)}
          onDate={() => openPicker(activeTask.id)}
          onWho={canAssign ? () => openWho(activeTask.id) : undefined}
          whoOpen={who?.id === activeTask.id}
          onDetail={() => toggleDetail(activeTask.id, false)}
          onMove={(dir) => moveRow(activeTask.id, dir)}
          onComplete={() => toggleDone(activeTask.id, true)}
          onDone={() => {
            setActiveId(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        />
      )}

      <TodoToasts
        toasts={undo.state.toasts}
        onUndo={undo.undoByKey}
        onClose={undo.dismiss}
        onPause={undo.pause}
        onResume={undo.resume}
        showShortcut={!coarse}
        className={showToolbar ? "bottom-[68px]" : "bottom-3"}
      />

      {!mobile && (
        <Popover
          open={Boolean(pickerTask)}
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
        >
          <PopoverAnchor virtualRef={anchorRef} />
          <PopoverContent
            data-todo-esc=""
            role="dialog"
            aria-label="Tarih"
            side="bottom"
            align="end"
            sideOffset={2}
            alignOffset={tablet ? 0 : 44}
            collisionPadding={8}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              document.getElementById(`tarih-yaz-${noteId}`)?.focus();
            }}
            onEscapeKeyDown={() => {
              pickerReturn.current = pickerRef.current?.id ?? null;
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const id = pickerReturn.current;
              pickerReturn.current = null;
              if (id) focusRow(id, "end");
            }}
            className={cn(
              "gap-0 rounded-xl border border-line bg-surface p-2 text-fg shadow-elevated ring-0 reduced-motion:animate-none",
              tablet ? "w-[340px]" : "w-[300px]",
            )}
          >
            {datePicker}
          </PopoverContent>
        </Popover>
      )}

      {!mobile && people && (
        <Popover
          open={Boolean(whoTask)}
          onOpenChange={(open) => {
            if (!open) setWho(null);
          }}
        >
          <PopoverAnchor virtualRef={anchorRef} />
          <PopoverContent
            data-todo-esc=""
            role="dialog"
            aria-label="Kişiye ata"
            side="bottom"
            align="end"
            sideOffset={2}
            alignOffset={tablet ? 0 : 44}
            collisionPadding={8}
            onOpenAutoFocus={(e) => {
              // Odak ilk kişiye (sen); ↑ / ↓ gezinir, Enter seçer.
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)
                ?.querySelector<HTMLElement>("[role=option]")
                ?.focus();
            }}
            onEscapeKeyDown={() => {
              whoReturn.current = whoRef.current?.id ?? null;
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const id = whoReturn.current;
              whoReturn.current = null;
              if (id) focusRow(id, "end");
            }}
            className="w-[280px] gap-0 rounded-xl border border-line bg-surface p-2 text-fg shadow-elevated ring-0 reduced-motion:animate-none"
          >
            {whoTask && (
              <PersonList
                key={whoTask.id}
                members={people.members}
                selected={assignees[whoTask.id] ?? []}
                onToggle={toggleAssignee}
                label={`Kişiye ata: ${whoTask.title.trim() || "Adsız görev"}`}
              />
            )}
          </PopoverContent>
        </Popover>
      )}

      {mobile && (
        <>
          <TodoSheet
            open={Boolean(pickerTask)}
            onOpenChange={(open) => {
              if (!open) {
                pickerReturn.current = pickerRef.current?.id ?? null;
                setPicker(null);
              }
            }}
            label="Tarih"
            description="Başlangıç ve bitiş tarihi; değişiklikler hemen uygulanır."
            initialFocus={() =>
              pickerRef.current?.viaKeyboard ? document.getElementById(`tarih-yaz-${noteId}`) : null
            }
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const id = pickerReturn.current;
              pickerReturn.current = null;
              if (id) focusRow(id, "end");
            }}
            header={
              <DateSheetHeader
                title={pickerTask?.title ?? ""}
                onDone={() => {
                  pickerReturn.current = pickerRef.current?.id ?? null;
                  setPicker(null);
                }}
              />
            }
          >
            {datePicker}
          </TodoSheet>
          <TaskDetailSheet
            open={Boolean(detailTask)}
            task={detailTask ?? null}
            tasks={tasks}
            today={today}
            onOpenChange={(open) => {
              if (!open) {
                detailReturn.current = detailRef.current?.id ?? null;
                setDetail(null);
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const id = detailReturn.current;
              detailReturn.current = null;
              if (id && findTask(current(), id)) focusRow(id, "end");
            }}
            onToggleDone={(id) => toggleDone(id)}
            onDescription={(id, html) => update(id, { description: html })}
            onOpenDate={(id) => {
              setDetail(null);
              openPicker(id);
            }}
            onAddChild={addChild}
            onDelete={deleteTask}
            people={
              detailTask && people
                ? {
                    assignees: assigneesOf(detailTask.id) ?? [],
                    canAssign,
                    onOpenWho: () => {
                      const id = detailTask.id;
                      setDetail(null);
                      openWho(id);
                    },
                  }
                : undefined
            }
            readOnly={!editable}
          />
          {people && (
            <TodoSheet
              open={Boolean(whoTask)}
              onOpenChange={(open) => {
                if (!open) {
                  whoReturn.current = whoRef.current?.id ?? null;
                  setWho(null);
                }
              }}
              label="Kişiye ata"
              description="Proje üyelerinden seç; değişiklikler hemen uygulanır."
              initialFocus={() =>
                whoRef.current?.viaKeyboard
                  ? document.querySelector<HTMLElement>(`[data-who-sheet] [role=option]`)
                  : null
              }
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                const id = whoReturn.current;
                whoReturn.current = null;
                if (id && findTask(current(), id)) focusRow(id, "end");
              }}
              header={
                <WhoSheetHeader
                  title={whoTask?.title ?? ""}
                  onDone={() => {
                    whoReturn.current = whoRef.current?.id ?? null;
                    setWho(null);
                  }}
                />
              }
            >
              {whoTask && (
                <div data-who-sheet="">
                  <PersonList
                    members={people.members}
                    selected={assignees[whoTask.id] ?? []}
                    onToggle={toggleAssignee}
                    large
                    label={`Kişiye ata: ${whoTask.title.trim() || "Adsız görev"}`}
                  />
                </div>
              )}
            </TodoSheet>
          )}
        </>
      )}

      <ShortcutCard
        open={help}
        onOpenChange={setHelp}
        onClosed={() => {
          const id = helpReturn.current;
          helpReturn.current = null;
          if (!id || !findTask(current(), id)) return false;
          focusRow(id, "end");
          return true;
        }}
      />
    </div>
  );
}

function DragGhost({ row }: { row: TaskRowData | undefined }) {
  if (!row) return null;
  return (
    <div className="drag-lift flex min-h-[38px] cursor-grabbing items-center gap-2 rounded-lg border border-line bg-surface py-0.5 pr-3 pl-8 shadow-elevated">
      <input
        type="checkbox"
        className="task-cb"
        disabled
        checked={false}
        readOnly
        aria-label={checkboxLabel(row.task.title)}
        tabIndex={-1}
      />
      <span className="truncate px-1.5 text-[15px]">{row.task.title || "Görev"}</span>
    </div>
  );
}
