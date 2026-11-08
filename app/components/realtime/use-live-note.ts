import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { NoteMetaPatch, TaskBroadcast } from "~/domain/realtime/protocol";
import type { LiveTaskSource } from "~/components/tasks/use-todo-tasks";
import type { Extensions } from "@tiptap/core";
import type { PresenceUser } from "~/domain/realtime/presence";
import type { NoteCollabSeed } from "~/domain/realtime/collab-seed";
import { loadCollab, loadedCollab, type CollabModule } from "./collab-loader";
import { useLiveConfig } from "./live-context";
import type { NoteSyncProvider, NoteSyncSnapshot } from "./note-provider";

export type UseLiveNoteOptions = {
  noteId: string;
  kind: "text" | "todo";
  /** Arayüzün bildiği salt okunurluk (görüntüleyici, çöpteki not); sunucu kesinleştirir. */
  readOnly?: boolean;
  /** Bağlanma (ör. çöpteki not için false). */
  enabled?: boolean;
  /**
   * Loader'dan gelen oda tohumu (metin notu): belge onunla başlar, metin bağlantıyı
   * beklemeden düzenlenebilir. Yalnızca ilk sağlayıcıda kullanılır (sıfırlamadan sonra değil).
   */
  seed?: NoteCollabSeed | null;
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
 * - `canEdit`: metin gövdesi düzenlenebilir mi — salt okunur değil ve ilk eşitleme bittiyse
 *   bağlı; bitmediyse belge loader tohumuyla başladı ve çevrimdışı değil (bağlantı kurulurken
 *   yazılanlar belgede bekler, hoş geldinde gider). `canWrite`: HTTP ile yazılanlar (başlık,
 *   görevler, renk …) için — çevrimdışı değil ve salt okunur değil. PLAN §5: çevrimdışıyken
 *   düzenleme kapalı.
 * - `provider` (Yjs `doc` + `awareness`) ve `editorExtensions(user, placeholder)`: Tiptap
 *   Collaboration + CollaborationCaret eklentileri (Yjs tembel yüklenir). `generation`
 *   sunucu belgeyi sıfırlayınca artar; editör bununla yeniden kurulmalı.
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
  /** Ortak metin editörünün eklentileri (sağlayıcı hazır değilse null). */
  editorExtensions: (user: PresenceUser, placeholder?: string) => Extensions | null;
  generation: number;
  tasks: LiveTaskSource;
  setFocus: (taskId: string | null) => void;
  flush: () => Promise<void>;
  reconnect: () => void;
};

const IDLE: NoteSyncSnapshot = {
  status: "baglaniyor",
  synced: false,
  seeded: false,
  lastSyncedAt: null,
  lastSavedAt: null,
  readOnly: false,
  peers: [],
  fatal: false,
};
const noopSubscribe = () => () => {};

/**
 * Sağlayıcı olaylarının bileşene köprüsü: sağlayıcı ilk çizimde kurulabildiği için
 * geri çağırmalar ref yerine bu nesneden okunur (güncel işleyiciler etkide yazılır).
 */
class NoteEvents {
  private handlers: Pick<UseLiveNoteOptions, "onMeta" | "onError"> = {};
  private readonly taskListeners = new Set<(s: TaskBroadcast) => void>();
  readonly tasks: LiveTaskSource = {
    subscribe: (listener) => {
      this.taskListeners.add(listener);
      return () => this.taskListeners.delete(listener);
    },
  };
  setHandlers(handlers: Pick<UseLiveNoteOptions, "onMeta" | "onError">) {
    this.handlers = handlers;
  }
  readonly onTasks = (s: TaskBroadcast) => this.taskListeners.forEach((l) => l(s));
  readonly onMeta = (m: NoteMetaPatch & { by: string }) => this.handlers.onMeta?.(m);
  readonly onError = (m: string) => this.handlers.onError?.(m);
}

export function useLiveNote({
  noteId,
  kind,
  readOnly = false,
  enabled = true,
  seed = null,
  onMeta,
  onError,
}: UseLiveNoteOptions): LiveNote | null {
  const config = useLiveConfig();
  const active = config.enabled && enabled && config.me !== null;
  const me = config.me;
  const [events] = useState(() => new NoteEvents());
  useEffect(() => {
    events.setHandlers({ onMeta, onError });
  });
  const [generation, setGeneration] = useState(0);
  // Sağlayıcı bağlantısız kurulur (`autoStart: false`), etkide başlatılır. Tohum yalnızca
  // ilk kuşakta: sıfırlanmış odada eski tohum yeniden sıfırlatırdı.
  const createProvider = (mod: CollabModule, gen: number) =>
    new mod.NoteSyncProvider({
      noteId,
      kind,
      me: me!,
      readOnly,
      initial: gen === 0 ? seed : null,
      autoStart: false,
      onTasks: events.onTasks,
      onMeta: events.onMeta,
      onError: events.onError,
      onReset: () => setGeneration((g) => g + 1),
    });
  // Parça önceden yüklendiyse (kartın üstüne gelince) sağlayıcı ilk çizimde hazırdır:
  // editör bir kez, doğrudan ortak düzenleme eklentileriyle kurulur.
  const [collabModule, setCollabModule] = useState<CollabModule | null>(loadedCollab);
  const [provider, setProvider] = useState<NoteSyncProvider | null>(() => {
    const mod = loadedCollab();
    return active && me && mod ? createProvider(mod, 0) : null;
  });
  const firstProvider = useRef(provider);

  useEffect(() => {
    if (!active || !me) return;
    let cancelled = false;
    let p: NoteSyncProvider | null = null;
    const begin = (mod: CollabModule) => {
      // İlk çizimde kurulan sağlayıcı bir kez benimsenir (StrictMode'un ikinci bağlanışında
      // ya da sıfırlamadan sonra yenisi kurulur).
      const first = firstProvider.current;
      firstProvider.current = null;
      const created = first && !first.isDestroyed ? first : createProvider(mod, generation);
      created.start();
      p = created;
      setCollabModule(mod);
      setProvider(created);
    };
    const mod = loadedCollab();
    if (mod) begin(mod);
    else
      void loadCollab().then(
        (m) => !cancelled && begin(m),
        () => {}, // parça yüklenemedi (çevrimdışı): not HTTP yoluyla açık kalır
      );
    return () => {
      cancelled = true;
      const closing = p;
      if (!closing) return;
      setProvider((cur) => (cur === closing ? null : cur));
      // Bekleyen kayıt istenir, sonra kapanır (son bağlantıda sunucu zaten yazar).
      void closing.close();
    };
    // `readOnly` yalnızca başlangıç ipucu; değişince yeniden bağlanmaya gerek yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, noteId, kind, me, generation]);

  const snapshot = useSyncExternalStore(
    provider?.subscribe ?? noopSubscribe,
    provider?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );

  const tasks = events.tasks;
  const setFocus = useCallback((taskId: string | null) => provider?.setFocus(taskId), [provider]);
  const flush = useCallback(() => provider?.flush() ?? Promise.resolve(), [provider]);
  const reconnect = useCallback(() => provider?.reconnect(), [provider]);
  const editorExtensions = useCallback(
    (user: PresenceUser, placeholder?: string) =>
      provider && collabModule ? collabModule.collabExtensions(provider, user, placeholder) : null,
    [provider, collabModule],
  );

  if (!active) return null;
  const effectiveReadOnly = readOnly || snapshot.readOnly;
  return {
    ...snapshot,
    readOnly: effectiveReadOnly,
    // İlk eşitlemeden önce tohumlu belge bağlantı kurulurken de düzenlenir; eşitlendikten
    // sonra eski kural: yalnızca bağlıyken (kopup yeniden bağlanırken düzenleme kapalı).
    canEdit:
      !effectiveReadOnly &&
      !snapshot.fatal &&
      (snapshot.synced
        ? snapshot.status === "bagli"
        : snapshot.seeded && snapshot.status !== "cevrimdisi"),
    canWrite: snapshot.status !== "cevrimdisi" && !effectiveReadOnly,
    provider,
    editorExtensions,
    generation,
    tasks,
    setFocus,
    flush,
    reconnect,
  };
}
