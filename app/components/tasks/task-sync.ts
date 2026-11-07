/**
 * Görev işlemlerinin sunucuya gönderimi (yapılacaklar notu arayüzü). Akış:
 * ağaç işlemi → yeni liste hemen gösterilir → işlemler kuyruğa girer → aynı anda tek
 * istek uçar (`POST /api/notlar/:id/gorevler`, `{ ops }`) → yanıttaki `tasks` gerçek
 * durumdur; o sırada kuyruğa giren işlemler bu durumun üstüne yeniden uygulanır.
 *
 * - Ardışık başlık/açıklama güncellemeleri aynı görevdeyse tek işleme birleşir ve kısa
 *   bir gecikmeyle gönderilir (yazarken her tuşta istek gitmez); yapısal işlemler hemen.
 * - 409 / 400 / 404: sunucudaki liste yeniden yüklenir, kuyruk boşaltılır.
 * - Ağ hatası: işlemler kuyruğun başına geri konur, kısa bir süre sonra yeniden denenir.
 *
 * React'ten bağımsızdır; `useTodoTasks` bunu bileşene bağlar.
 */
import type { Task } from "~/domain/tasks/model";
import { applyTaskOps, type TaskOp } from "~/domain/tasks/ops";

/** Yazarken (başlık, açıklama) gönderim gecikmesi (ms). */
export const TYPING_FLUSH_MS = 500;
const RETRY_MS = 3000;

/** Görev kimliği → atanan kullanıcı kimlikleri (yalnızca proje notunda dolu). */
export type AssigneeMap = Record<string, string[]>;

export type SendResult =
  { ok: true; tasks: Task[]; assignees?: AssigneeMap } | { ok: false; status: number };

/** `assign` işlemlerini atama haritasına uygular (tam liste; boş liste atamayı kaldırır). */
export function applyAssignOps(map: AssigneeMap, ops: readonly TaskOp[]): AssigneeMap {
  let out = map;
  for (const op of ops) {
    if (op.op !== "assign") continue;
    if (out === map) out = { ...map };
    if (op.userIds.length) out[op.id] = [...op.userIds];
    else delete out[op.id];
  }
  return out;
}

export type TaskSyncOptions = {
  send: (ops: TaskOp[]) => Promise<SendResult>;
  reload: () => Promise<Task[] | null>;
  /** Sunucudan gelen (kuyruktaki işlemler yeniden uygulanmış) liste. */
  onTasks: (tasks: Task[]) => void;
  /** Sunucudan gelen atamalar (kuyruktaki `assign` işlemleri yeniden uygulanmış). */
  onAssignees?: (assignees: AssigneeMap) => void;
  /** Kuyruk boşalıp istek kalmayınca (ör. ızgarayı yeniden doğrulamak için). */
  onIdle?: () => void;
  /** Yeniden yükleme gerektiren hata (409 …). */
  onConflict?: (status: number) => void;
  typingDelay?: number;
};

const isTyping = (op: TaskOp) =>
  op.op === "update" &&
  (op.title !== undefined || op.description !== undefined) &&
  op.startDate === undefined &&
  op.dueDate === undefined &&
  op.dueTime === undefined;

/** Kuyruğa ekler; son işlemle aynı görevin güncellemesiyse birleştirir. */
export function mergeOps(queue: readonly TaskOp[], ops: readonly TaskOp[]): TaskOp[] {
  const out = [...queue];
  for (const op of ops) {
    const last = out.at(-1);
    if (op.op === "update" && last?.op === "update" && last.id === op.id) {
      out[out.length - 1] = { ...last, ...op };
    } else if (op.op === "assign" && last?.op === "assign" && last.id === op.id) {
      // Atama tam listedir: aynı görevin son ataması öncekinin yerine geçer.
      out[out.length - 1] = op;
    } else {
      out.push(op);
    }
  }
  return out;
}

export function createTaskSync(options: TaskSyncOptions) {
  const delay = options.typingDelay ?? TYPING_FLUSH_MS;
  let queue: TaskOp[] = [];
  let inflight: TaskOp[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let waiters: (() => void)[] = [];

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const settleIdle = () => {
    if (inflight || queue.length) return;
    const w = waiters;
    waiters = [];
    w.forEach((fn) => fn());
    options.onIdle?.();
  };

  async function reloadAll(status: number) {
    queue = [];
    options.onConflict?.(status);
    const fresh = await options.reload().catch(() => null);
    if (fresh && !disposed) options.onTasks(fresh);
  }

  async function flush() {
    clearTimer();
    if (inflight || queue.length === 0 || disposed) return;
    const ops = queue;
    queue = [];
    inflight = ops;
    let result: SendResult | null = null;
    try {
      result = await options.send(ops);
    } catch {
      result = null;
    }
    inflight = null;
    if (disposed) return;
    if (result === null) {
      // Ağ hatası: sırayı koruyarak geri koy, sonra yeniden dene.
      queue = mergeOps(ops, queue);
      timer = setTimeout(() => void flush(), RETRY_MS);
      return;
    }
    if (!result.ok) {
      await reloadAll(result.status);
      settleIdle();
      return;
    }
    if (result.assignees) options.onAssignees?.(applyAssignOps(result.assignees, queue));
    if (queue.length === 0) {
      options.onTasks(result.tasks);
    } else {
      try {
        options.onTasks(applyTaskOps(result.tasks, queue, { now: Date.now(), userId: "" }));
      } catch {
        await reloadAll(409);
        settleIdle();
        return;
      }
    }
    if (queue.length) {
      if (!timer) void flush();
    } else settleIdle();
  }

  return {
    /** İşlemleri kuyruğa ekler. Yazım güncellemeleri gecikmeli, diğerleri hemen gönderilir. */
    push(ops: readonly TaskOp[]) {
      if (ops.length === 0 || disposed) return;
      queue = mergeOps(queue, ops);
      if (ops.every(isTyping)) {
        clearTimer();
        timer = setTimeout(() => void flush(), delay);
      } else {
        void flush();
      }
    },
    flush: () => flush(),
    /** Bekleyen her şey gönderilip yanıtlanınca çözülür. */
    whenIdle(): Promise<void> {
      if (!inflight && queue.length === 0) return Promise.resolve();
      const p = new Promise<void>((resolve) => waiters.push(resolve));
      void flush();
      return p;
    },
    get pending() {
      return queue.length > 0 || inflight !== null;
    },
    /** Sayfadan ayrılırken: kuyruktakini yanıt beklemeden gönderir. */
    drain(sendNow: (ops: TaskOp[]) => void) {
      clearTimer();
      if (queue.length) sendNow(queue);
      queue = [];
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}

export type TaskSync = ReturnType<typeof createTaskSync>;
