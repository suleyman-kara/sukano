import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import type { Task } from "~/domain/tasks/model";
import type { TaskOp } from "~/domain/tasks/ops";
import type { TreeEdit } from "~/domain/tasks/tree";
import {
  applyAssignOps,
  createTaskSync,
  type AssigneeMap,
  type RemoteTaskState,
  type SendResult,
  type TaskSync,
} from "./task-sync";

/**
 * Canlı görev kaynağı (not odası): yetkili durum yayınları. Bkz. `useLiveNote` →
 * `live.tasks`.
 */
export type LiveTaskSource = {
  subscribe: (listener: (state: RemoteTaskState) => void) => () => void;
};

export const tasksUrl = (noteId: string) => `/api/notlar/${encodeURIComponent(noteId)}/gorevler`;

/** Görev işlemlerini gönderir; yanıt `{ ok, tasks, assignees? }`. */
export async function postTaskOps(
  noteId: string,
  ops: TaskOp[],
  init: RequestInit = {},
): Promise<SendResult> {
  const res = await fetch(tasksUrl(noteId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ops }),
    ...init,
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as {
    ok: boolean;
    tasks?: Task[];
    assignees?: AssigneeMap;
    seq?: number;
  };
  if (!data.ok || !data.tasks) return { ok: false, status: 500 };
  return {
    ok: true,
    tasks: data.tasks,
    ...(data.assignees ? { assignees: data.assignees } : {}),
    ...(typeof data.seq === "number" ? { seq: data.seq } : {}),
  };
}

async function loadState(
  noteId: string,
): Promise<{ tasks: Task[]; assignees?: AssigneeMap } | null> {
  const res = await fetch(tasksUrl(noteId), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json()) as { tasks: Task[]; assignees?: AssigneeMap };
}

const EMPTY_ASSIGNEES: AssigneeMap = {};

/** Izgarayı yeniden doğrulamadan önce kuyruk bu kadar sessiz kalmalı (ms). */
const REVALIDATE_IDLE_MS = 700;

/**
 * Yapılacaklar notunun görev listesi: yerel durum + sunucu eşitlemesi (bkz. task-sync).
 * `apply(edit)` yeni listeyi hemen gösterir ve işlemleri kuyruğa ekler. Olay
 * işleyicileri zincirleme düzenlemelerde güncel listeyi `current()` ile okur.
 */
export function useTodoTasks(
  noteId: string,
  initial: Task[],
  initialAssignees: AssigneeMap = EMPTY_ASSIGNEES,
  live?: LiveTaskSource | null,
) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const ref = useRef<Task[]>(initial);
  const [assignees, setAssigneesState] = useState<AssigneeMap>(initialAssignees);
  const assigneesRef = useRef<AssigneeMap>(initialAssignees);
  const setAssignees = useCallback((next: AssigneeMap) => {
    assigneesRef.current = next;
    setAssigneesState(next);
  }, []);
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidate.current = revalidator.revalidate;
  });
  const syncRef = useRef<TaskSync | null>(null);

  /** Eşitleyici ilk kullanımda kurulur (yalnızca olay işleyicileri ve efektlerde). */
  const getSync = useCallback((): TaskSync => {
    if (syncRef.current) return syncRef.current;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    syncRef.current = createTaskSync({
      send: (ops) => postTaskOps(noteId, ops),
      reload: async () => {
        const state = await loadState(noteId);
        if (state?.assignees) setAssignees(state.assignees);
        return state?.tasks ?? null;
      },
      onTasks: (next) => {
        ref.current = next;
        setTasks(next);
      },
      onAssignees: setAssignees,
      onConflict: () => {
        toast("Görevler başka bir yerde değişmiş; liste yenilendi.");
      },
      onIdle: () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void revalidate.current(), REVALIDATE_IDLE_MS);
      },
    });
    return syncRef.current;
  }, [noteId, setAssignees]);

  useEffect(() => {
    const onHide = () =>
      syncRef.current?.drain(
        (ops) => void postTaskOps(noteId, ops, { keepalive: true }).catch(() => {}),
      );
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      // Not kapanırken bekleyen işlemler yanıt beklenmeden gönderilir. (StrictMode'un
      // çift efekti eşitleyiciyi kapatmasın diye `dispose` çağrılmaz.)
      onHide();
    };
  }, [noteId]);

  // Başka sekme / kişinin görev yazımları: kuyruktaki yerel işlemler korunarak benimsenir.
  useEffect(() => live?.subscribe((state) => getSync().remote(state)), [live, getSync]);

  const apply = useCallback(
    (edit: TreeEdit | null) => {
      if (!edit) return false;
      ref.current = edit.tasks;
      setTasks(edit.tasks);
      getSync().push(edit.ops);
      return true;
    },
    [getSync],
  );

  /** Görevin atananlarını değiştirir (tam liste); hemen gösterilir, kuyruğa eklenir. */
  const assign = useCallback(
    (taskId: string, userIds: string[]) => {
      const op = { op: "assign" as const, id: taskId, userIds };
      setAssignees(applyAssignOps(assigneesRef.current, [op]));
      getSync().push([op]);
    },
    [getSync, setAssignees],
  );

  const current = useCallback(() => ref.current, []);
  /** Bekleyen işlemler sunucuya ulaşıp yanıtlanınca çözülür. */
  const whenIdle = useCallback(() => syncRef.current?.whenIdle() ?? Promise.resolve(), []);

  return { tasks, apply, current, whenIdle, assignees, assign };
}

export type TodoTasks = ReturnType<typeof useTodoTasks>;
