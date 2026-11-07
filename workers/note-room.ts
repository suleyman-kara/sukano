import { DurableObject } from "cloudflare:workers";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { createDb } from "~/db/client";
import { notes } from "~/db/schema";
import { eq } from "drizzle-orm";
import { can } from "~/domain/projects/permissions";
import { isEmptyNoteYDoc, noteYDocToHtml, seedNoteYDoc } from "~/domain/realtime/note-doc";
import {
  applyAwarenessEntries,
  awarenessSnapshot,
  decodeAwarenessUpdate,
  encodeAwarenessUpdate,
  removalEntries,
  sanitizeAwarenessEntries,
  type AwarenessEntry,
  type AwarenessMap,
  type PresenceUser,
} from "~/domain/realtime/presence";
import {
  CLOSE_CODES,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  parseNoteClientMessage,
  type AssigneeMap,
  type NoteServerMessage,
} from "~/domain/realtime/protocol";
import type { Task } from "~/domain/tasks/model";
import type { TaskOp } from "~/domain/tasks/ops";
import { expectedFailure, type ExpectedFailure } from "~/lib/api-errors.server";
import { noteAccess, noteScope } from "~/lib/note-access.server";
import { NoteNotFoundError } from "~/lib/notes.server";
import {
  channelOfNote,
  persistCollabText,
  publishChannel,
  type NoteRoomChange,
} from "~/lib/realtime.server";

/** Son düzenlemeden en geç bu kadar sonra D1'e yazılır (ms; PLAN: ≤ 5 sn). */
export const PERSIST_DELAY_MS = 2000;
/** Bağlantının rolü en çok bu aralıkla D1'den yeniden denetlenir (düzenleme gelince; ms). */
export const ROLE_RECHECK_MS = 30_000;
/** Birleştirilmiş durum bu boyutu aşarsa güncelleme satırları birleştirilmez (SQLite satır sınırı). */
const MAX_COMPACT_BYTES = 1_500_000;

/** Worker'ın (yetki denetiminden sonra) odaya ilettiği bağlantı bilgisi başlıkları. */
export const ROOM_HEADERS = {
  user: "x-sukano-kullanici",
  note: "x-sukano-not",
  readOnly: "x-sukano-salt-okunur",
} as const;

/** WebSocket eki (hibernation'dan sonra da okunur; ≤ 2 KB). */
type SocketInfo = PresenceUser & {
  readOnly: boolean;
  /** Bu bağlantının farkındalık istemci kimlikleri (kapanınca varlıktan silinir). */
  clientIds: number[];
  /** Rolün en son D1'den denetlendiği an (ms). */
  checkedAt: number;
  /** Salt okunur uyarısı gönderildi mi (her düzenlemede tekrar gönderilmez). */
  warned?: boolean;
};

export type TaskApplyResult =
  | { ok: true; tasks: Task[]; assignees: AssigneeMap; seq: number }
  | ({ ok: false } & ExpectedFailure);

const SEED = Symbol("seed");
const LOAD = Symbol("load");

/**
 * Not odası: not başına bir Durable Object (`NOTE_ROOM.getByName(noteId)`).
 *
 * - **Bağlantı:** Worker `GET /api/notlar/:id/canli` isteğinde oturumu ve not erişimini
 *   denetler, kişiyi ve salt okunurluğu başlıklarla iletir. WebSocket Hibernation API'si:
 *   bağlantı bilgisi ekte (`serializeAttachment`), etiket kullanıcı kimliği.
 * - **Metin notu (Yjs):** y-protocols eşitleme + farkındalık. Belge güncellemeleri
 *   geldikçe DO SQLite deposuna eklenir (tahliye/uykudan sonra oradan kurulur); ilk
 *   açılışta belge D1 HTML'inden doldurulur. Görüntüleyicinin düzenlemeleri uygulanmaz.
 *   D1 kopyası alarmla yazılır: ilk değişiklikten `PERSIST_DELAY_MS` sonra, son bağlantı
 *   kapanınca hemen, istemci `kaydet` deyince hemen.
 * - **Yapılacaklar notu:** görev işlemleri HTTP ile gelir ve Worker onları bu odanın
 *   `applyTaskOps` RPC'sine verir: oda tek sıradır (D1 yazımı + yayın aynı kuyrukta),
 *   sonuç `gorevler` iletisiyle tüm bağlantılara sıra numarasıyla gider.
 */
export class NoteRoom extends DurableObject<Env> {
  private doc: Y.Doc | null = null;
  private loading: Promise<Y.Doc> | null = null;
  /** Varlık durumları (bellekte; uykudan sonra istemcilerden yeniden istenir). */
  private awareness: AwarenessMap = new Map();
  /** Kalıcı yazım, sıfırlama ve görev işlemleri bu kuyrukta sırayla çalışır. */
  private chain: Promise<unknown> = Promise.resolve();
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.createTables();
    // Canlılık yoklaması uyandırmadan yanıtlanır.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  /* ---------------------------- depolama ---------------------------- */

  private createTables() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS editors (user_id TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
    );
  }

  private meta(key: string): string | null {
    const row = this.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key)
      .toArray()[0];
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string | null) {
    if (value === null) this.sql.exec(`DELETE FROM meta WHERE key = ?`, key);
    else this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, key, value);
  }

  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  /** Belge (bellekte yoksa depodan; hiç doldurulmadıysa D1'den). */
  private ready(): Promise<Y.Doc> {
    if (this.doc) return Promise.resolve(this.doc);
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<Y.Doc> {
    const doc = new Y.Doc();
    const rows = this.sql
      .exec<{ data: ArrayBuffer }>(`SELECT data FROM updates ORDER BY id`)
      .toArray();
    doc.transact(() => {
      for (const r of rows) Y.applyUpdate(doc, new Uint8Array(r.data), LOAD);
    }, LOAD);
    doc.on("update", (update: Uint8Array, origin: unknown) => this.onDocUpdate(update, origin));
    if (this.meta("seeded") !== "1") await this.seed(doc);
    if (!this.meta("docId")) this.setMeta("docId", crypto.randomUUID());
    this.doc = doc;
    return doc;
  }

  /** İlk açılış: notun türünü okur, metin notunda belgeyi D1 HTML'inden doldurur. */
  private async seed(doc: Y.Doc) {
    const noteId = this.meta("noteId");
    if (!noteId) return;
    const row = await createDb(this.env.DB)
      .select({ kind: notes.kind, bodyHtml: notes.bodyHtml })
      .from(notes)
      .where(eq(notes.id, noteId))
      .get();
    if (!row) return;
    this.setMeta("kind", row.kind);
    if (row.kind === "text" && isEmptyNoteYDoc(doc)) {
      doc.transact(() => seedNoteYDoc(doc, row.bodyHtml), SEED);
      this.setMeta("lastHtml", row.bodyHtml ?? "");
    }
    this.setMeta("seeded", "1");
  }

  private onDocUpdate(update: Uint8Array, origin: unknown) {
    if (origin === LOAD) return;
    this.sql.exec(`INSERT INTO updates (data) VALUES (?)`, update);
    if (origin === SEED) return;
    // İstemci düzenlemesi: kalıcı yazım planlanır, diğer bağlantılara yayınlanır.
    const ws = origin as WebSocket;
    const info = ws.deserializeAttachment() as SocketInfo;
    this.setMeta("dirty", "1");
    this.sql.exec(
      `INSERT OR REPLACE INTO editors (user_id, at) VALUES (?, ?)`,
      info.id,
      Date.now(),
    );
    void this.schedulePersist(PERSIST_DELAY_MS);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.broadcast(encoding.toUint8Array(encoder), ws);
  }

  private async schedulePersist(delay: number) {
    const at = Date.now() + delay;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  /* --------------------------- bağlantılar --------------------------- */

  private sockets(except?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private broadcast(message: string | Uint8Array, except?: WebSocket) {
    for (const ws of this.sockets(except)) {
      try {
        ws.send(message);
      } catch {
        // Kapanmakta olan bağlantı.
      }
    }
  }

  private sendJson(ws: WebSocket, message: NoteServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Kapanmakta olan bağlantı.
    }
  }

  private awarenessMessage(entries: readonly AwarenessEntry[]): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(entries));
    return encoding.toUint8Array(encoder);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket bekleniyor", { status: 426 });
    }
    const noteId = request.headers.get(ROOM_HEADERS.note);
    const rawUser = request.headers.get(ROOM_HEADERS.user);
    if (!noteId || !rawUser) return new Response("Yetkisiz", { status: 401 });
    const user = JSON.parse(decodeURIComponent(rawUser)) as PresenceUser;
    if (!this.meta("noteId")) this.setMeta("noteId", noteId);
    await this.ready();

    const { 0: client, 1: server } = new WebSocketPair();
    const info: SocketInfo = {
      ...user,
      readOnly: request.headers.get(ROOM_HEADERS.readOnly) === "1",
      clientIds: [],
      checkedAt: Date.now(),
    };
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment(info);

    this.sendJson(server, {
      t: "hosgeldin",
      docId: this.meta("docId") ?? "",
      kind: this.meta("kind") === "todo" ? "todo" : "text",
      readOnly: info.readOnly,
      user: { id: user.id, name: user.name, color: user.color },
      seq: Number(this.meta("seq") ?? 0),
    });
    // Sunucu da eşitleme adım 1'i gönderir: istemcide sunucuya ulaşmamış değişiklik
    // varsa (kopmadan hemen önce yazılan) adım 2 ile gelir.
    if (this.meta("kind") !== "todo") {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc!);
      server.send(encoding.toUint8Array(encoder));
    }
    if (this.awareness.size > 0) {
      server.send(this.awarenessMessage(awarenessSnapshot(this.awareness)));
    } else if (this.sockets(server).length > 0) {
      // Uykudan sonra varlık bilgisi bellekte yok: diğerlerinden yeniden iste.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_QUERY_AWARENESS);
      this.broadcast(encoding.toUint8Array(encoder), server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" && !(message instanceof ArrayBuffer)) {
      message = await (message as Blob).arrayBuffer();
    }
    if (typeof message === "string") {
      const msg = parseNoteClientMessage(message);
      if (msg?.t === "kaydet") {
        await this.queue(() => this.persist());
        this.sendJson(ws, { t: "kaydedildi", at: Date.now() });
      }
      return;
    }
    const doc = await this.ready();
    let info = ws.deserializeAttachment() as SocketInfo;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const step = decoding.readVarUint(decoder);
        if (step === syncProtocol.messageYjsSyncStep1) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.writeSyncStep2(encoder, doc, decoding.readVarUint8Array(decoder));
          ws.send(encoding.toUint8Array(encoder));
          return;
        }
        if (step !== syncProtocol.messageYjsSyncStep2 && step !== syncProtocol.messageYjsUpdate)
          return;
        const update = decoding.readVarUint8Array(decoder);
        if (Date.now() - info.checkedAt > ROLE_RECHECK_MS) {
          const fresh = await this.recheck(ws, info);
          if (!fresh) return;
          info = fresh;
        }
        if (info.readOnly || this.meta("kind") === "todo") {
          if (!info.warned && update.byteLength > 2) {
            ws.serializeAttachment({ ...info, warned: true });
            this.sendJson(ws, {
              t: "hata",
              code: "salt_okunur",
              message: "Salt okunur: düzenlemen kaydedilmedi.",
            });
          }
          return;
        }
        Y.applyUpdate(doc, update, ws);
        return;
      }
      if (type === MESSAGE_AWARENESS) {
        const entries = sanitizeAwarenessEntries(
          decodeAwarenessUpdate(decoding.readVarUint8Array(decoder)),
          { id: info.id, name: info.name, color: info.color, avatarUrl: info.avatarUrl ?? null },
        );
        const ids = new Set(info.clientIds);
        for (const e of entries) {
          if (e.state === null) ids.delete(e.clientID);
          else ids.add(e.clientID);
        }
        if (
          ids.size !== info.clientIds.length ||
          [...ids].some((id) => !info.clientIds.includes(id))
        )
          ws.serializeAttachment({ ...info, clientIds: [...ids].slice(-8) });
        const changed = applyAwarenessEntries(this.awareness, entries);
        if (changed.length) this.broadcast(this.awarenessMessage(changed), ws);
        return;
      }
      if (type === MESSAGE_QUERY_AWARENESS) {
        ws.send(this.awarenessMessage(awarenessSnapshot(this.awareness)));
      }
    } catch {
      this.sendJson(ws, { t: "hata", code: "gecersiz", message: "Geçersiz ileti" });
    }
  }

  /** Rolü D1'den yeniden denetler; erişim kalktıysa bağlantıyı kapatır (null). */
  private async recheck(ws: WebSocket, info: SocketInfo): Promise<SocketInfo | null> {
    const noteId = this.meta("noteId");
    try {
      const scope = await noteScope(createDb(this.env.DB), info.id, noteId ?? "");
      const readOnly = scope.kind === "project" && !can(scope.role, "note.edit");
      const next = { ...info, readOnly, checkedAt: Date.now() };
      ws.serializeAttachment(next);
      if (readOnly !== info.readOnly) this.sendJson(ws, { t: "rol", readOnly });
      return next;
    } catch (error) {
      if (!(error instanceof NoteNotFoundError)) throw error;
      ws.close(CLOSE_CODES.erisimYok, "Erişim yok");
      return null;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.dropSocket(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // Zaten kapandı.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.dropSocket(ws);
  }

  private dropSocket(ws: WebSocket) {
    const info = ws.deserializeAttachment() as SocketInfo | null;
    if (info?.clientIds.length) {
      const removed = removalEntries(this.awareness, info.clientIds);
      applyAwarenessEntries(this.awareness, removed);
      if (removed.length) this.broadcast(this.awarenessMessage(removed), ws);
    }
    // Son bağlantı kapandı: bekleyen değişiklik hemen yazılsın.
    if (this.sockets(ws).length === 0 && this.meta("dirty") === "1") void this.schedulePersist(0);
  }

  /* ---------------------------- kalıcılık ---------------------------- */

  async alarm(): Promise<void> {
    await this.queue(() => this.persist());
  }

  /** Bekleyen değişiklikleri D1'e yazar (kuyrukta çağrılır). */
  private async persist(): Promise<void> {
    if (this.meta("dirty") !== "1") return;
    const noteId = this.meta("noteId");
    if (!noteId) return;
    const doc = await this.ready();
    const html = noteYDocToHtml(doc);
    const editors = this.sql
      .exec<{ user_id: string }>(`SELECT user_id FROM editors ORDER BY at, user_id`)
      .toArray()
      .map((r) => r.user_id);
    const result = await persistCollabText(this.env, {
      noteId,
      html,
      lastHtml: this.meta("lastHtml") ?? "",
      editors,
      now: new Date(),
    });
    switch (result.status) {
      case "ok":
        this.setMeta("lastHtml", html);
        this.clearDirty();
        this.compact(doc);
        this.broadcast(
          JSON.stringify({ t: "kaydedildi", at: Date.now() } satisfies NoteServerMessage),
        );
        this.ctx.waitUntil(
          publishChannel(this.env, result.channel, [{ type: "icerik", noteId }], result.by),
        );
        return;
      case "unchanged":
      case "gone":
        this.clearDirty();
        return;
      case "external":
        await this.reset();
        return;
    }
  }

  private clearDirty() {
    this.setMeta("dirty", null);
    this.sql.exec(`DELETE FROM editors`);
  }

  /** Güncelleme satırlarını tek duruma birleştirir. */
  private compact(doc: Y.Doc) {
    const state = Y.encodeStateAsUpdate(doc);
    if (state.byteLength > MAX_COMPACT_BYTES) return;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM updates`);
      this.sql.exec(`INSERT INTO updates (data) VALUES (?)`, state);
    });
  }

  /**
   * Belgeyi atar: D1 gövdesi odanın dışında değişti. Bağlantılar `sifirla` alıp
   * kapanır; istemciler belgelerini atıp yeniden bağlanır, oda D1'den yeniden dolar.
   */
  private async reset(code: number = CLOSE_CODES.sifirlandi) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM updates`);
      this.sql.exec(`DELETE FROM editors`);
      for (const key of ["seeded", "kind", "lastHtml", "dirty", "docId"]) this.setMeta(key, null);
    });
    this.doc?.destroy();
    this.doc = null;
    this.awareness.clear();
    await this.ctx.storage.deleteAlarm();
    for (const ws of this.ctx.getWebSockets()) {
      if (code === CLOSE_CODES.sifirlandi) this.sendJson(ws, { t: "sifirla" });
      try {
        ws.close(code, code === CLOSE_CODES.sifirlandi ? "Belge sıfırlandı" : "Not silindi");
      } catch {
        // Zaten kapandı.
      }
    }
  }

  /* ------------------------------ RPC ------------------------------- */

  /**
   * HTTP ile değişen not alanlarını bağlantılara iletir; `reset` belgeyi D1'den yeniden
   * kurdurur, `deleted` odayı boşaltıp bağlantıları kapatır.
   */
  async noteChanged(change: NoteRoomChange): Promise<void> {
    if (change.deleted) {
      await this.purge();
      return;
    }
    if (change.reset) {
      await this.queue(() => this.reset());
      return;
    }
    if (change.meta && Object.keys(change.meta).length) {
      this.broadcast(
        JSON.stringify({ t: "not", by: change.by, ...change.meta } satisfies NoteServerMessage),
      );
    }
  }

  /**
   * Görev işlemlerini uygular (Worker `POST /api/notlar/:id/gorevler`). Yetki ve doğrulama
   * HTTP yolundakiyle aynı kod (`noteAccess(...).forNote(...).tasks.apply`); oda kuyruğu
   * işlemleri tek sıraya dizer, sonuç sıra numarasıyla tüm bağlantılara yayınlanır.
   */
  async applyTaskOps(noteId: string, userId: string, ops: TaskOp[]): Promise<TaskApplyResult> {
    return this.queue(async () => {
      try {
        const { scope, tasks } = await noteAccess(this.env, userId).forNote(noteId);
        // Oda kimliği yalnızca erişim doğrulanınca yazılır (olmayan not için depo açılmaz).
        if (!this.meta("noteId")) this.setMeta("noteId", noteId);
        const state = await tasks.apply(noteId, ops);
        const seq = Number(this.meta("seq") ?? 0) + 1;
        this.setMeta("seq", String(seq));
        this.broadcast(
          JSON.stringify({ t: "gorevler", seq, ...state, by: userId } satisfies NoteServerMessage),
        );
        const channel = channelOfNote(
          scope.kind === "project"
            ? { ownerUserId: null, projectId: scope.projectId }
            : { ownerUserId: userId, projectId: null },
        );
        if (channel)
          this.ctx.waitUntil(
            publishChannel(this.env, channel, [{ type: "icerik", noteId }], userId),
          );
        return { ok: true as const, ...state, seq };
      } catch (error) {
        const failure = expectedFailure(error);
        if (!failure) throw error;
        return { ok: false as const, ...failure };
      }
    });
  }

  /**
   * Not kalıcı silindi (eylem, cron temizliği, hesap silme): bağlantılar 4404 ile kapanır,
   * alarm silinir ve DO deposu tamamen boşaltılır (Yjs güncellemeleri, meta, düzenleyenler).
   * Aynı kimlikle sonradan bağlanılırsa oda boş tablolarla yeniden başlar.
   */
  async purge(): Promise<void> {
    await this.queue(async () => {
      await this.reset(CLOSE_CODES.erisimYok);
      await this.ctx.storage.deleteAll();
      this.createTables();
    });
  }

  /** Bekleyen değişiklikleri hemen yazar (testler ve yönetim için). */
  async flush(): Promise<void> {
    await this.queue(() => this.persist());
  }
}
