import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Task } from "~/domain/tasks/model";
import {
  clearOnTyping,
  dismissToast,
  emptyUndo,
  pausedLeft,
  resumeDelay,
  TOAST_MAX,
  TOAST_MS,
  undoLast,
  undoToast,
  type UndoState,
} from "~/domain/tasks/undo";

type Timer = { handle: ReturnType<typeof setTimeout> | null; left: number; start: number };

/**
 * Not içi toast yığını ve Ctrl+Z (PLAN §10): en çok 2 toast, 8 sn; üzerine gelince ya
 * da odaktayken süreler durur, çıkınca en az 2 sn daha görünür. Tamamlama toast'ları ve
 * Ctrl+Z yığını `app/domain/tasks/undo.ts` durum makinesiyle; "Tamamlananları sil" ve
 * görev silme toast'ları aynı yığında, Ctrl+Z'ye girmeden geri yükleme taşır.
 */
export function useTodoUndo(handlers: {
  /** Geri alınan tamamlama: bu kimlikleri yeniden aç. */
  onReopen: (ids: string[]) => void;
  /** Silme geri alındı: görevleri geri getir. */
  onRestore: (removed: Task[]) => void;
}) {
  const [state, setState] = useState<UndoState>(emptyUndo);
  const ref = useRef(state);
  const timers = useRef(new Map<string, Timer>());
  const restores = useRef(new Map<string, Task[]>());
  const paused = useRef(false);
  const h = useRef(handlers);
  useLayoutEffect(() => {
    h.current = handlers;
  });

  const commit = useCallback((next: UndoState) => {
    ref.current = next;
    setState(next);
    // Görünmeyen toast'ların zamanlayıcıları temizlenir.
    for (const [key, t] of timers.current) {
      if (!next.toasts.some((x) => x.key === key)) {
        if (t.handle) clearTimeout(t.handle);
        timers.current.delete(key);
        restores.current.delete(key);
      }
    }
  }, []);

  const drop = useCallback((key: string) => commit(dismissToast(ref.current, key)), [commit]);

  const arm = useCallback(
    (key: string, ms: number) => {
      const old = timers.current.get(key);
      if (old?.handle) clearTimeout(old.handle);
      const t: Timer = { handle: null, left: ms, start: Date.now() };
      if (!paused.current) t.handle = setTimeout(() => drop(key), ms);
      timers.current.set(key, t);
    },
    [drop],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => t.handle && clearTimeout(t.handle));
  }, []);

  /** `toggleWithUndo` sonucu: yeni durum ve (tamamlandıysa) toast. */
  const afterToggle = useCallback(
    (next: UndoState, toastKey: string | null) => {
      commit(next);
      if (toastKey) arm(toastKey, TOAST_MS);
    },
    [commit, arm],
  );

  /** Silme toast'ı ("3 tamamlanan görev silindi · Geri al"). Ctrl+Z yığınına girmez. */
  const pushRestore = useCallback(
    (text: string, removed: Task[]) => {
      const s = ref.current;
      const seq = s.seq + 1;
      const key = `k${seq}`;
      restores.current.set(key, removed);
      commit({ ...s, seq, toasts: [{ key, text, ids: [] }, ...s.toasts].slice(0, TOAST_MAX) });
      arm(key, TOAST_MS);
    },
    [commit, arm],
  );

  /** Ctrl+Z: son tamamlamayı geri alır; yığın boşsa false (tuş metne kalır). */
  const undoLastCompletion = useCallback(() => {
    const r = undoLast(ref.current);
    if (!r) return false;
    commit(r.state);
    h.current.onReopen(r.ids);
    return true;
  }, [commit]);

  const undoByKey = useCallback(
    (key: string) => {
      const removed = restores.current.get(key);
      if (removed) {
        restores.current.delete(key);
        commit(dismissToast(ref.current, key));
        h.current.onRestore(removed);
        return;
      }
      const r = undoToast(ref.current, key);
      if (!r) return;
      commit(r.state);
      h.current.onReopen(r.ids);
    },
    [commit],
  );

  const pause = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    const now = Date.now();
    for (const t of timers.current.values()) {
      if (t.handle) clearTimeout(t.handle);
      t.handle = null;
      t.left = pausedLeft(t.left, t.start, now);
    }
  }, []);

  const resume = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    for (const toast of ref.current.toasts)
      arm(toast.key, resumeDelay(timers.current.get(toast.key)?.left));
  }, [arm]);

  /** Başlık yazıldı: Ctrl+Z metne aittir. */
  const typing = useCallback(() => {
    const next = clearOnTyping(ref.current);
    if (next !== ref.current) commit(next);
  }, [commit]);

  return {
    state,
    current: () => ref.current,
    afterToggle,
    pushRestore,
    undoLast: undoLastCompletion,
    undoByKey,
    dismiss: drop,
    pause,
    resume,
    typing,
  };
}

export type TodoUndo = ReturnType<typeof useTodoUndo>;
