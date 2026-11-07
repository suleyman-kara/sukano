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
 * - Canlı yayın (`remote`): not odası her yazımın sonucunu sıra numarasıyla (`seq`) tüm
 *   açık sekmelere yollar. Eski numaralı durum yok sayılır; istek uçarken gelen durum
 *   bekletilir ve yanıttan büyük numaralıysa (yani bizim işlemimizi de içeriyorsa) yanıtın
 *   yerine kullanılır. Kuyruktaki (henüz gönderilmemiş) işlemler her zaman gelen durumun
 *   üstüne yeniden uygulanır: yazılan ama gönderilmemiş metin ezilmez.
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
  | { ok: true; tasks: Task[]; assignees?: AssigneeMap; seq?: number }
  | { ok: false; status: number };

/** Not odasının yayınladığı yetkili durum (bkz. `TaskBroadcast`). */
export type RemoteTaskState = { tasks: Task[]; assignees: AssigneeMap; seq: number };

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
  /** Uygulanan en büyük sıra numarası (yanıt ya da yayın). */
  let lastSeq = 0;
  /** İstek uçarken gelen en yeni yayın. */
  let buffered: RemoteTaskState | null = null;

  /** Yetkili durumu benimser; kuyruktaki işlemler üstüne yeniden uygulanır. */
  function adopt(state: RemoteTaskState) {
    lastSeq = Math.max(lastSeq, state.seq);
    buffered = null;
    options.onAssignees?.(applyAssignOps(state.assignees, queue));
    if (queue.length === 0) {
      options.onTasks(state.tasks);
      return;
    }
    try {
      options.onTasks(applyTaskOps(state.tasks, queue, { now: Date.now(), userId: "" }));
    } catch {
      // Gönderilmemiş işlem artık uygulanamıyor (görev başka yerde silindi …).
      queue = [];
      clearTimer();
      options.onConflict?.(409);
      options.onTasks(state.tasks);
    }
  }

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
      if (buffered) adopt(buffered);
      timer = setTimeout(() => void flush(), RETRY_MS);
      return;
    }
    if (!result.ok) {
      buffered = null;
      await reloadAll(result.status);
      settleIdle();
      return;
    }
    let base: { tasks: Task[]; assignees?: AssigneeMap } = result;
    if (result.seq !== undefined) {
      if (buffered && buffered.seq > result.seq) base = buffered;
      lastSeq = Math.max(lastSeq, result.seq, buffered?.seq ?? 0);
    }
    buffered = null;
    if (base.assignees) options.onAssignees?.(applyAssignOps(base.assignees, queue));
    if (queue.length === 0) {
      options.onTasks(base.tasks);
    } else {
      try {
        options.onTasks(applyTaskOps(base.tasks, queue, { now: Date.now(), userId: "" }));
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
    /**
     * Not odasından gelen yetkili durum. Eski numaralı yok sayılır; istek uçarken
     * bekletilir (yanıt gelince hangisi yeniyse o kullanılır).
     */
    remote(state: RemoteTaskState) {
      if (disposed || state.seq <= lastSeq) return;
      if (inflight) {
        if (!buffered || state.seq > buffered.seq) buffered = state;
        return;
      }
      adopt(state);
    },
    /** Uygulanan son sıra numarası. */
    get seq() {
      return lastSeq;
    },
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
