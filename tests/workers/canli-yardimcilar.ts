/**
 * Canlı katman Worker testleri için WebSocket istemcisi: Worker'a yükseltme isteği atar,
 * gelen iletileri biriktirir; metin notunda y-protocols ile Yjs belgesini eşitler.
 */
import { exports } from "cloudflare:workers";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { NOTE_FRAGMENT, noteYDocToHtml } from "~/domain/realtime/note-doc";
import {
  decodeAwarenessUpdate,
  encodeAwarenessUpdate,
  type AwarenessEntry,
} from "~/domain/realtime/presence";
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  type ChannelServerMessage,
  type NoteServerMessage,
} from "~/domain/realtime/protocol";
import { ORIGIN } from "./kimlik-yardimcilar";

export type Upgrade = { status: number; ws: WebSocket | null };

export async function upgrade(
  path: string,
  cookie?: string,
  headers: Record<string, string> = {},
): Promise<Upgrade> {
  const h = new Headers({ Upgrade: "websocket", origin: ORIGIN, ...headers });
  if (cookie) h.set("cookie", cookie);
  const res = await exports.default.fetch(`${ORIGIN}${path}`, { headers: h });
  if (res.status !== 101 || !res.webSocket) {
    await res.body?.cancel();
    return { status: res.status, ws: null };
  }
  res.webSocket.accept();
  return { status: 101, ws: res.webSocket };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Biriktiren istemci: JSON iletileri `json`, ikili iletiler `binary`. */
export class LiveClient<M = NoteServerMessage> {
  json: M[] = [];
  binary: Uint8Array[] = [];
  closed: { code: number; reason: string } | null = null;
  readonly doc = new Y.Doc();
  /** Farkındalık: istemci kimliği → durum (gelen güncellemeler). */
  readonly awareness = new Map<number, unknown>();

  /** İletiler geliş sırasıyla işlenir (Blob okuma eşzamansız). */
  private chain: Promise<void> = Promise.resolve();

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const raw = e.data as string | ArrayBuffer | Blob;
      this.chain = this.chain.then(async () => {
        if (typeof raw === "string") {
          this.json.push(JSON.parse(raw) as M);
          return;
        }
        const data = new Uint8Array(raw instanceof Blob ? await raw.arrayBuffer() : raw);
        this.binary.push(data);
        this.onBinary(data);
      });
    });
    ws.addEventListener("close", (e) => {
      this.closed = { code: e.code, reason: e.reason };
    });
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.send(encoding.toUint8Array(encoder));
    });
  }

  private onBinary(data: Uint8Array) {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1) this.send(encoding.toUint8Array(encoder));
    } else if (type === MESSAGE_AWARENESS) {
      for (const e of decodeAwarenessUpdate(decoding.readVarUint8Array(decoder))) {
        if (e.state === null) this.awareness.delete(e.clientID);
        else this.awareness.set(e.clientID, e.state);
      }
    }
  }

  send(data: string | Uint8Array) {
    this.ws.send(data);
  }

  /** Eşitleme adım 1 (istemcinin durum vektörü). */
  syncStep1() {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send(encoding.toUint8Array(encoder));
  }

  sendAwareness(entries: AwarenessEntry[]) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(entries));
    this.send(encoding.toUint8Array(encoder));
  }

  get html() {
    return noteYDocToHtml(this.doc);
  }

  /** İlk paragrafın metnine ekler (belge yerelde değişir, güncelleme gönderilir). */
  type(text: string, index = 0) {
    const para = this.doc.getXmlFragment(NOTE_FRAGMENT).get(0) as Y.XmlElement;
    let node = para.get(0) as Y.XmlText | undefined;
    if (!node) {
      node = new Y.XmlText();
      para.insert(0, [node]);
    }
    node.insert(index, text);
  }

  async waitFor<T extends M>(pred: (m: M) => m is T, timeout?: number): Promise<T>;
  async waitFor(pred: (m: M) => boolean, timeout?: number): Promise<M>;
  async waitFor(pred: (m: M) => boolean, timeout = 3000): Promise<M> {
    const start = Date.now();
    for (;;) {
      const found = this.json.find(pred);
      if (found) return found;
      if (Date.now() - start > timeout)
        throw new Error(`ileti gelmedi: ${JSON.stringify(this.json)}`);
      await sleep(10);
    }
  }

  async until(cond: () => boolean, timeout = 3000, what = "koşul") {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > timeout) throw new Error(`${what} sağlanmadı`);
      await sleep(10);
    }
  }

  close() {
    try {
      this.ws.close(1000, "bitti");
    } catch {
      // zaten kapalı
    }
  }
}

/** Not odasına bağlanır, hoş geldin iletisini ve (metin notunda) ilk eşitlemeyi bekler. */
export async function joinNote(noteId: string, cookie: string) {
  const { status, ws } = await upgrade(`/api/notlar/${noteId}/canli`, cookie);
  if (!ws) throw new Error(`bağlanamadı: ${status}`);
  const client = new LiveClient(ws);
  const hello = await client.waitFor((m) => m.t === "hosgeldin");
  if (hello.t === "hosgeldin" && hello.kind === "text") {
    client.syncStep1();
    await client.until(() => client.doc.getXmlFragment(NOTE_FRAGMENT).length > 0, 3000, "eşitleme");
  }
  return client;
}

export async function joinChannel(path: string, cookie: string) {
  const { status, ws } = await upgrade(path, cookie);
  if (!ws) throw new Error(`bağlanamadı: ${status}`);
  const client = new LiveClient<ChannelServerMessage>(ws);
  await client.waitFor((m) => m.t === "hosgeldin");
  return client;
}

export { sleep };
