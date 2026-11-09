/**
 * Not odası istemcisi (tarayıcı): `LiveSocket` + Yjs belgesi + y-protocols farkındalığı.
 * React'ten bağımsızdır; `useLiveNote` bunu bileşene bağlar.
 *
 * Akış: bağlantı açılır → sunucu `hosgeldin` (belge kimliği, tür, salt okunurluk) →
 * metin notunda eşitleme adım 1/2 → `synced`. Yerel belge güncellemeleri ve farkındalık
 * değişiklikleri anında gönderilir; sunucudan gelenler belgeye / farkındalığa uygulanır.
 * Belge kimliği değişirse (sunucu belgeyi sıfırladı) `onReset` çağrılır: elindeki belgeyi
 * birleştirmek içeriği çoğaltır, bu yüzden çağıran yeni bir sağlayıcı kurar.
 *
 * Tohum (`initial`, açık notun loader'ından; bkz. `collab-seed.ts`): belge odadaki durumla
 * başlar ve belge kimliği bilinir; `seeded` olur, düzenleyici bağlantıyı beklemeden
 * düzenlenebilir. Hoş geldinden önce yazılanlar belgede bekler (gönderilmez); hoş geldinde
 * sunucunun adım 1'ine verilen adım 2 yanıtıyla gider. Hoş geldindeki kimlik tohumunkinden
 * farklıysa (oda arada sıfırlandı) ikili ileti işlenmeden `onReset` çağrılır.
 */
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { decodeCollabSeed, type NoteCollabSeed } from "~/domain/realtime/collab-seed";
import { mergePresence, samePeers, type Peer, type PresenceUser } from "~/domain/realtime/presence";
import {
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  noteLivePath,
  parseNoteServerMessage,
  type NoteMetaPatch,
  type TaskBroadcast,
} from "~/domain/realtime/protocol";
import { LiveSocket, type LiveSocketOptions, type LiveStatus } from "./live-socket";

export type NoteSyncSnapshot = {
  status: LiveStatus;
  /** Metin notunda ilk eşitleme tamamlandı (yapılacaklarda hoş geldin yeterli). */
  synced: boolean;
  /** Belge loader tohumuyla başladı: eşitlemeden önce de düzenlenebilir. */
  seeded: boolean;
  /** Sunucuyla son eşitlenme anı (ms): eşitleme, yayın ya da gönderim sonrası. */
  lastSyncedAt: number | null;
  /** D1 kopyasının son yazıldığı an (ms; `kaydedildi`). */
  lastSavedAt: number | null;
  /** Sunucuya göre salt okunur (görüntüleyici). */
  readOnly: boolean;
  /** Notu açık tutan diğer kişiler. */
  peers: Peer[];
  /** Erişim kalktı (yeniden denenmez). */
  fatal: boolean;
};

export type NoteSyncProviderOptions = {
  noteId: string;
  kind: "text" | "todo";
  /** Bu sekmenin kişisi (farkındalık durumu; sunucu yine oturumdakiyle değiştirir). */
  me: PresenceUser;
  /** Başlangıçta biliniyorsa salt okunurluk (sunucu `hosgeldin`'de kesinleştirir). */
  readOnly?: boolean;
  /** Odadaki belgenin loader'dan gelen durumu (metin notu). */
  initial?: NoteCollabSeed | null;
  /** false: bağlantı `start()` ile açılır (varsayılan: hemen). */
  autoStart?: boolean;
  onTasks?: (state: TaskBroadcast) => void;
  onMeta?: (meta: NoteMetaPatch & { by: string }) => void;
  /** Sunucu belgeyi sıfırladı: yeni sağlayıcı kurulmalı. */
  onReset?: () => void;
  /** Sunucu düzenlemeyi reddetti (salt okunur …). */
  onError?: (message: string) => void;
  socket?: Partial<LiveSocketOptions>;
};

export class NoteSyncProvider {
  readonly doc = new Y.Doc();
  readonly awareness: Awareness;
  private readonly socket: LiveSocket;
  private snapshot: NoteSyncSnapshot;
  private listeners = new Set<() => void>();
  private docId: string | null = null;
  private welcomed = false;
  private resetting = false;
  private destroyed = false;
  private started = false;
  private saveWaiters: (() => void)[] = [];
  /** Hoş geldinden önce yapılmış, sunucuya henüz gitmemiş yerel değişiklik var. */
  private unsent = false;
  private deliveryWaiters: (() => void)[] = [];

  constructor(private readonly options: NoteSyncProviderOptions) {
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalState({ user: options.me, focus: null });
    const seed = options.kind === "text" ? decodeCollabSeed(options.initial) : null;
    if (seed) {
      try {
        Y.applyUpdate(this.doc, seed.state, this);
        this.docId = seed.docId;
      } catch {
        // Bozuk tohum: belge boş kalır, ilk eşitleme beklenir.
      }
    }
    this.snapshot = {
      status: "baglaniyor",
      synced: false,
      seeded: this.docId !== null,
      lastSyncedAt: null,
      lastSavedAt: null,
      readOnly: options.readOnly ?? false,
      peers: [],
      fatal: false,
    };
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.awareness.on("change", this.onAwarenessChange);
    this.socket = new LiveSocket({
      url: noteLivePath(options.noteId),
      ...options.socket,
      onOpen: () => {
        this.welcomed = false;
      },
      onMessage: (data) => this.onMessage(data),
      onClose: () => this.onSocketClose(),
      onStatus: () => this.refresh(),
    });
    if (options.autoStart !== false) this.start();
  }

  /** Bağlantıyı açar (bir kez; `autoStart: false` ile kurulduysa). */
  start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.socket.start();
  }

  get isDestroyed() {
    return this.destroyed;
  }

  /* --------------------------- abonelik --------------------------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<NoteSyncSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (patch.peers && samePeers(patch.peers, this.snapshot.peers))
      next.peers = this.snapshot.peers;
    const changed = (Object.keys(next) as (keyof NoteSyncSnapshot)[]).some(
      (k) => next[k] !== this.snapshot[k],
    );
    if (!changed) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private refresh() {
    // Durum "bağlı" yalnızca hoş geldin geldikten sonra (yetki ve belge kimliği belli).
    const raw = this.socket.status;
    this.update({
      status: raw === "bagli" && !this.welcomed ? "baglaniyor" : raw,
      fatal: this.socket.fatal,
    });
  }

  /* ---------------------------- gönderim ---------------------------- */

  private sendBinary(write: (encoder: encoding.Encoder) => void) {
    const encoder = encoding.createEncoder();
    write(encoder);
    return this.socket.send(encoding.toUint8Array(encoder));
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed || this.snapshot.readOnly) return;
    // Hoş geldinden önce: belgede bekler, hoş geldindeki adım 2 yanıtıyla gider.
    if (!this.welcomed) {
      this.unsent = true;
      return;
    }
    const sent = this.sendBinary((e) => {
      encoding.writeVarUint(e, MESSAGE_SYNC);
      syncProtocol.writeUpdate(e, update);
    });
    if (sent) this.update({ lastSyncedAt: Date.now() });
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return;
    const changed = [...added, ...updated, ...removed].filter((id) => id === this.doc.clientID);
    if (!changed.length || !this.welcomed) return;
    this.sendBinary((e) => {
      encoding.writeVarUint(e, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(e, encodeAwarenessUpdate(this.awareness, changed));
    });
  };

  private onAwarenessChange = () => {
    this.update({
      peers: mergePresence(this.awareness.getStates(), {
        selfClientId: this.doc.clientID,
        selfUserId: this.options.me.id,
      }),
    });
  };

  /* ----------------------------- alım ----------------------------- */

  private onMessage(data: string | ArrayBuffer) {
    if (this.resetting) return;
    if (typeof data === "string") {
      this.onJson(data);
      return;
    }
    // Hoş geldin (ve belge kimliği denetimi) gelmeden ikili ileti işlenmez: sıfırlanmış
    // odaya eski belgeyi (adım 2 yanıtıyla) göndermek içeriği çoğaltırdı.
    if (!this.welcomed) return;
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      const step = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1 && !this.snapshot.readOnly) {
        // Sunucunun adım 1'ine adım 2: sunucuda olmayan her şey (bağlantıdan önce yazılanlar
        // dahil) gider.
        if (
          this.socket.send(encoding.toUint8Array(encoder)) &&
          step === syncProtocol.messageYjsSyncStep1
        )
          this.delivered();
      }
      this.update({
        lastSyncedAt: Date.now(),
        ...(step === syncProtocol.messageYjsSyncStep2 ? { synced: true } : {}),
      });
    } else if (type === MESSAGE_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    } else if (type === MESSAGE_QUERY_AWARENESS) {
      this.announce();
    }
  }

  private onJson(raw: string) {
    const msg = parseNoteServerMessage(raw);
    if (!msg) return;
    switch (msg.t) {
      case "hosgeldin": {
        if (this.docId !== null && this.docId !== msg.docId && this.options.kind === "text") {
          this.resetRequested();
          return;
        }
        this.docId = msg.docId;
        this.welcomed = true;
        this.update({
          readOnly: msg.readOnly,
          lastSyncedAt: Date.now(),
          ...(msg.kind === "todo" || this.options.kind === "todo" ? { synced: true } : {}),
        });
        this.refresh();
        if (this.options.kind === "text" && msg.kind === "text") {
          this.sendBinary((e) => {
            encoding.writeVarUint(e, MESSAGE_SYNC);
            syncProtocol.writeSyncStep1(e, this.doc);
          });
        }
        this.announce();
        return;
      }
      case "gorevler":
        this.update({ lastSyncedAt: Date.now() });
        this.options.onTasks?.(msg);
        return;
      case "not": {
        const { t: _t, ...meta } = msg;
        this.options.onMeta?.(meta);
        return;
      }
      case "kaydedildi": {
        this.update({ lastSavedAt: msg.at, lastSyncedAt: Date.now() });
        const waiters = this.saveWaiters;
        this.saveWaiters = [];
        waiters.forEach((w) => w());
        return;
      }
      case "sifirla":
        this.resetRequested();
        return;
      case "rol":
        this.update({ readOnly: msg.readOnly });
        return;
      case "hata":
        this.options.onError?.(msg.message);
        return;
    }
  }

  /** Belge sıfırlandı: bu sağlayıcı bir daha bağlanmaz, çağıran yenisini kurar. */
  private resetRequested() {
    if (this.resetting) return;
    this.resetting = true;
    this.welcomed = false;
    this.socket.stop();
    this.options.onReset?.();
  }

  private delivered() {
    this.unsent = false;
    const waiters = this.deliveryWaiters;
    this.deliveryWaiters = [];
    waiters.forEach((w) => w());
  }

  /** Bağlantıdan önce yazılanlar gidene kadar (en çok `timeoutMs`) bekler. */
  private waitForDelivery(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.deliveryWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private announce() {
    if (!this.awareness.getLocalState()) return;
    this.sendBinary((e) => {
      encoding.writeVarUint(e, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(e, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
    });
  }

  private onSocketClose() {
    this.welcomed = false;
    // Kopukken diğer kişiler listede kalmasın.
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    if (others.length) removeAwarenessStates(this.awareness, others, this);
    this.refresh();
  }

  /* ------------------------------ API ------------------------------ */

  /** Yapılacaklar notunda odaklanılan görev (varlık). */
  setFocus(taskId: string | null) {
    const state = this.awareness.getLocalState();
    if (!state || (state.focus?.taskId ?? null) === taskId) return;
    this.awareness.setLocalStateField("focus", taskId ? { taskId } : null);
  }

  /**
   * Bekleyen değişiklikleri sunucunun hemen D1'e yazmasını ister. `kaydedildi` gelince ya
   * da `timeoutMs` dolunca çözülür; bağlantı yoksa hemen.
   */
  flush(timeoutMs = 3000): Promise<void> {
    if (!this.socket.send(JSON.stringify({ t: "kaydet" }))) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.saveWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Hemen yeniden bağlanmayı dener (çevrimdışı bandındaki "Yeniden dene"). */
  reconnect() {
    this.socket.reconnectNow();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Ayrıldığımızı bildir, sonra kapat.
    removeAwarenessStates(this.awareness, [this.doc.clientID], "yerel");
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.off("change", this.onAwarenessChange);
    this.doc.off("update", this.onDocUpdate);
    this.socket.stop();
    this.awareness.destroy();
    this.doc.destroy();
    this.saveWaiters.forEach((w) => w());
    this.saveWaiters = [];
    this.deliveryWaiters.forEach((w) => w());
    this.deliveryWaiters = [];
    this.listeners.clear();
  }

  /**
   * Bekleyen kaydı isteyip (en çok `timeoutMs`) kapatır: not kapanırken. Bağlantı kurulmadan
   * yazılmış değişiklik varsa önce onun gitmesi beklenir (en çok `deliveryMs`; bağlantı
   * arka planda kurulmaya devam eder).
   */
  async close(timeoutMs = 2000, deliveryMs = 8000) {
    if (this.unsent) await this.waitForDelivery(deliveryMs);
    await this.flush(timeoutMs);
    this.destroy();
  }
}
