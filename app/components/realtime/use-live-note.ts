import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { NoteMetaPatch, TaskBroadcast } from "~/domain/realtime/protocol";
import type { LiveTaskSource } from "~/components/tasks/use-todo-tasks";
import { useLiveConfig } from "./live-context";
import { NoteSyncProvider, type NoteSyncSnapshot } from "./note-provider";

export type UseLiveNoteOptions = {
  noteId: string;
  kind: "text" | "todo";
  /** Arayüzün bildiği salt okunurluk (görüntüleyici, çöpteki not); sunucu kesinleştirir. */
  readOnly?: boolean;
  /** Bağlanma (ör. çöpteki not için false). */
  enabled?: boolean;
  /** HTTP ile değişen alanlar (başlık, renk, sabit, arşiv, çöp) başka yerden gelince. */
  onMeta?: (meta: NoteMetaPatch & { by: string }) => void;
  /** Sunucu düzenlemeyi reddetti. */
  onError?: (message: string) => void;
};

/**
 * Açık notun canlı durumu (4b arayüzü bunun üstüne kurulur).
 *
 * - `status`: `baglaniyor` | `bagli` | `cevrimdisi`; `lastSyncedAt`, `lastSavedAt` (ms).
 * - `peers`: notu açık tutan diğer kişiler (`Peer[]`, kişi başına tek kayıt).
 * - `canEdit`: metin gövdesi düzenlenebilir mi — bağlı, ilk eşitleme bitti, salt okunur
 *   değil. `canWrite`: HTTP ile yazılanlar (başlık, görevler, renk …) için — çevrimdışı
 *   değil ve salt okunur değil. PLAN §5: çevrimdışıyken düzenleme kapalı.
 * - `provider` / `doc` / `awareness`: Tiptap Collaboration ve CollaborationCaret için.
 *   `generation` sunucu belgeyi sıfırlayınca artar; editör bununla yeniden kurulmalı.
 * - `tasks`: yapılacaklar notunda görev yayınları (`useTodoTasks`'in `live` parametresi).
 * - `setFocus(taskId)`: varlıkta odaklanılan görev; `flush()`: bekleyeni hemen D1'e yazdır.
 *
 * Canlı katman kapalıysa (`LiveConfigProvider` yok) `null` döner: çağıran eski (yalnızca
 * HTTP) davranışa düşer.
 */
export type LiveNote = NoteSyncSnapshot & {
  canEdit: boolean;
  canWrite: boolean;
  provider: NoteSyncProvider | null;
  generation: number;
  tasks: LiveTaskSource;
  setFocus: (taskId: string | null) => void;
  flush: () => Promise<void>;
  reconnect: () => void;
};

const IDLE: NoteSyncSnapshot = {
  status: "baglaniyor",
  synced: false,
  lastSyncedAt: null,
  lastSavedAt: null,
  readOnly: false,
  peers: [],
  fatal: false,
};
const noopSubscribe = () => () => {};

export function useLiveNote({
  noteId,
  kind,
  readOnly = false,
  enabled = true,
  onMeta,
  onError,
}: UseLiveNoteOptions): LiveNote | null {
  const config = useLiveConfig();
  const active = config.enabled && enabled && config.me !== null;
  const [provider, setProvider] = useState<NoteSyncProvider | null>(null);
  const [generation, setGeneration] = useState(0);
  const handlers = useRef({ onMeta, onError });
  useEffect(() => {
    handlers.current = { onMeta, onError };
  });
  const taskListeners = useRef(new Set<(s: TaskBroadcast) => void>());
  const me = config.me;

  useEffect(() => {
    if (!active || !me) return;
    const p = new NoteSyncProvider({
      noteId,
      kind,
      me,
      readOnly,
      onTasks: (s) => taskListeners.current.forEach((l) => l(s)),
      onMeta: (m) => handlers.current.onMeta?.(m),
      onError: (m) => handlers.current.onError?.(m),
      onReset: () => setGeneration((g) => g + 1),
    });
    setProvider(p);
    return () => {
      setProvider((cur) => (cur === p ? null : cur));
      // Bekleyen kayıt istenir, sonra kapanır (son bağlantıda sunucu zaten yazar).
      void p.close();
    };
    // `readOnly` yalnızca başlangıç ipucu; değişince yeniden bağlanmaya gerek yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, noteId, kind, me, generation]);

  const snapshot = useSyncExternalStore(
    provider?.subscribe ?? noopSubscribe,
    provider?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );

  const tasks = useMemo<LiveTaskSource>(
    () => ({
      subscribe(listener) {
        taskListeners.current.add(listener);
        return () => taskListeners.current.delete(listener);
      },
    }),
    [],
  );
  const setFocus = useCallback((taskId: string | null) => provider?.setFocus(taskId), [provider]);
  const flush = useCallback(() => provider?.flush() ?? Promise.resolve(), [provider]);
  const reconnect = useCallback(() => provider?.reconnect(), [provider]);

  if (!active) return null;
  const effectiveReadOnly = readOnly || snapshot.readOnly;
  return {
    ...snapshot,
    readOnly: effectiveReadOnly,
    canEdit: snapshot.status === "bagli" && snapshot.synced && !effectiveReadOnly,
    canWrite: snapshot.status !== "cevrimdisi" && !effectiveReadOnly,
    provider,
    generation,
    tasks,
    setFocus,
    flush,
    reconnect,
  };
}
