import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import type { Task } from "~/domain/tasks/model";
import type { TaskOp } from "~/domain/tasks/ops";
import type { TreeEdit } from "~/domain/tasks/tree";
import { createTaskSync, type SendResult, type TaskSync } from "./task-sync";

export const tasksUrl = (noteId: string) => `/api/notlar/${encodeURIComponent(noteId)}/gorevler`;

/** Görev işlemlerini gönderir; yanıt `{ ok, tasks }`. */
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
  const data = (await res.json()) as { ok: boolean; tasks?: Task[] };
  return data.ok && data.tasks ? { ok: true, tasks: data.tasks } : { ok: false, status: 500 };
}

async function loadTasks(noteId: string): Promise<Task[] | null> {
  const res = await fetch(tasksUrl(noteId), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return ((await res.json()) as { tasks: Task[] }).tasks;
}

/** Izgarayı yeniden doğrulamadan önce kuyruk bu kadar sessiz kalmalı (ms). */
const REVALIDATE_IDLE_MS = 700;

/**
 * Yapılacaklar notunun görev listesi: yerel durum + sunucu eşitlemesi (bkz. task-sync).
 * `apply(edit)` yeni listeyi hemen gösterir ve işlemleri kuyruğa ekler. Olay
 * işleyicileri zincirleme düzenlemelerde güncel listeyi `current()` ile okur.
 */
export function useTodoTasks(noteId: string, initial: Task[]) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const ref = useRef<Task[]>(initial);
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
      reload: () => loadTasks(noteId),
      onTasks: (next) => {
        ref.current = next;
        setTasks(next);
      },
      onConflict: () => {
        toast("Görevler başka bir yerde değişmiş; liste yenilendi.");
      },
      onIdle: () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void revalidate.current(), REVALIDATE_IDLE_MS);
      },
    });
    return syncRef.current;
  }, [noteId]);

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

  const current = useCallback(() => ref.current, []);
  /** Bekleyen işlemler sunucuya ulaşıp yanıtlanınca çözülür. */
  const whenIdle = useCallback(() => syncRef.current?.whenIdle() ?? Promise.resolve(), []);

  return { tasks, apply, current, whenIdle };
}

export type TodoTasks = ReturnType<typeof useTodoTasks>;
