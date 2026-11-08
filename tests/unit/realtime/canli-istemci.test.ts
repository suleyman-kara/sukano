import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { LiveSocket, toWsUrl, type LiveStatus } from "~/components/realtime/live-socket";
import { NoteSyncProvider } from "~/components/realtime/note-provider";
import { createTaskSync } from "~/components/tasks/task-sync";
import { encodeCollabSeed } from "~/domain/realtime/collab-seed";
import { NOTE_FRAGMENT, noteYDocToHtml, seedNoteYDoc } from "~/domain/realtime/note-doc";
import { decodeAwarenessUpdate, encodeAwarenessUpdate } from "~/domain/realtime/presence";
import {
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
} from "~/domain/realtime/protocol";
import { makeTask } from "~/domain/tasks/model";
import { createFake, FakeSocket, fakeOnline } from "./sahte-soket";

beforeEach(() => {
  FakeSocket.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function socket(extra: Partial<ConstructorParameters<typeof LiveSocket>[0]> = {}) {
  const online = fakeOnline();
  const statuses: LiveStatus[] = [];
  const messages: (string | ArrayBuffer)[] = [];
  const closes: number[] = [];
  const s = new LiveSocket({
    url: "ws://test/oda",
    createSocket: createFake,
    online: online.source,
    random: () => 0.5,
    onStatus: (st) => statuses.push(st),
    onMessage: (d) => messages.push(d),
    onClose: (c) => closes.push(c),
    ...extra,
  });
  return { s, online, statuses, messages, closes };
}

describe("LiveSocket", () => {
  it("bağlanır, iletileri iletir; pong iletilmez", () => {
    const { s, statuses, messages } = socket();
    s.start();
    expect(s.status).toBe("baglaniyor");
    FakeSocket.last.open();
    expect(statuses).toEqual(["bagli"]);
    expect(FakeSocket.last.binaryType).toBe("arraybuffer");
    FakeSocket.last.receive('{"t":"x"}');
    FakeSocket.last.receive('{"t":"pong"}');
    expect(messages).toEqual(['{"t":"x"}']);
    expect(s.send("a")).toBe(true);
    expect(s.isOpen).toBe(true);
    s.stop();
    expect(s.send("b")).toBe(false);
  });

  it("kopunca bekleme çizelgesiyle yeniden dener; açılınca sayaç sıfırlanır", () => {
    const { s, statuses } = socket();
    s.start();
    FakeSocket.last.serverClose(1006);
    expect(s.status).toBe("cevrimdisi");
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(499);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    expect(s.status).toBe("baglaniyor");
    FakeSocket.last.serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.last.open();
    FakeSocket.last.serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(4);
    expect(statuses).toContain("bagli");
    s.stop();
  });

  it("4404 ölümcüldür (yeniden denenmez); 4009 ve 4000 hemen yeniden bağlanır", () => {
    const a = socket();
    a.s.start();
    FakeSocket.last.open();
    FakeSocket.last.serverClose(4009);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.last.open();
    FakeSocket.last.serverClose(4000);
    expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.last.serverClose(4404);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(3);
    expect(a.s.fatal).toBe(true);
    expect(a.s.status).toBe("cevrimdisi");
    a.s.reconnectNow();
    expect(FakeSocket.all).toHaveLength(3);
  });

  it("çevrimdışıyken bağlanmaz; çevrimiçi olunca hemen bağlanır; çevrimdışı olunca kapatır", () => {
    const { s, online } = socket();
    online.set(false);
    s.start();
    expect(s.status).toBe("cevrimdisi");
    expect(FakeSocket.all).toHaveLength(0);
    online.set(true);
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.last.open();
    online.set(false);
    expect(FakeSocket.last.closedWith).not.toBeNull();
    expect(s.status).toBe("cevrimdisi");
    // Kopuşta da tarayıcı çevrimdışıysa zamanlayıcı kurulmaz.
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    s.stop();
  });

  it("canlılık: ping gider, yanıt gelmezse bağlantı yeniden kurulur", () => {
    const { s, closes } = socket({ pingMs: 1000, pongTimeoutMs: 500 });
    s.start();
    FakeSocket.last.open();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.last.sent).toEqual(['{"t":"ping"}']);
    FakeSocket.last.receive('{"t":"pong"}');
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(500);
    expect(closes).toContain(4001);
    expect(s.status).toBe("cevrimdisi");
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(2);
    s.stop();
  });

  it("soket kurulamazsa yeniden dener; yol ws adresine çevrilir", () => {
    let fail = true;
    const { s } = socket({
      createSocket: (url) => {
        if (fail) throw new Error("yok");
        return createFake(url);
      },
    });
    s.start();
    expect(s.status).toBe("cevrimdisi");
    fail = false;
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(1);
    s.stop();
    expect(toWsUrl("wss://x/y")).toBe("wss://x/y");
    expect(toWsUrl("/api/kanal/kisisel")).toBe(`ws://${window.location.host}/api/kanal/kisisel`);
  });
});

/* ------------------------------------------------------------------ */
/* Not odası sağlayıcısı                                                */
/* ------------------------------------------------------------------ */

const me = { id: "u1", name: "Ayşe", color: "#123456" };

function hello(docId = "d1", extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    t: "hosgeldin",
    docId,
    kind: "text",
    readOnly: false,
    user: me,
    seq: 0,
    ...extra,
  });
}

function provider(extra: Partial<ConstructorParameters<typeof NoteSyncProvider>[0]> = {}) {
  const online = fakeOnline();
  return new NoteSyncProvider({
    noteId: "n1",
    kind: "text",
    me,
    socket: { createSocket: createFake, online: online.source, random: () => 0.5, pingMs: 0 },
    ...extra,
  });
}

/** Sunucu belgesiyle eşitleme: istemcinin adım 1'ine adım 2 yanıtı. */
function serverStep2(server: Y.Doc, clientStep1: Uint8Array) {
  const d = decoding.createDecoder(clientStep1);
  expect(decoding.readVarUint(d)).toBe(MESSAGE_SYNC);
  expect(decoding.readVarUint(d)).toBe(syncProtocol.messageYjsSyncStep1);
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MESSAGE_SYNC);
  syncProtocol.writeSyncStep2(e, server, decoding.readVarUint8Array(d));
  return encoding.toUint8Array(e);
}

function decodeUpdate(msg: Uint8Array): Uint8Array | null {
  const d = decoding.createDecoder(msg);
  if (decoding.readVarUint(d) !== MESSAGE_SYNC) return null;
  if (decoding.readVarUint(d) !== syncProtocol.messageYjsUpdate) return null;
  return decoding.readVarUint8Array(d);
}

describe("NoteSyncProvider", () => {
  it("hoş geldinden sonra eşitlenir; durum bağlı, belge sunucununki", () => {
    const p = provider();
    const ws = FakeSocket.last;
    ws.open();
    expect(p.getSnapshot().status).toBe("baglaniyor");
    ws.receive(hello());
    expect(p.getSnapshot().status).toBe("bagli");
    const server = new Y.Doc();
    seedNoteYDoc(server, "<p>sunucu</p>");
    ws.receive(serverStep2(server, ws.binary[0]!));
    expect(p.getSnapshot().synced).toBe(true);
    expect(p.getSnapshot().lastSyncedAt).not.toBeNull();
    expect(noteYDocToHtml(p.doc)).toBe("<p>sunucu</p>");
    // Farkındalık durumu da gönderildi.
    const aw = ws.binary.find((b) => b[0] === MESSAGE_AWARENESS)!;
    const d = decoding.createDecoder(aw);
    decoding.readVarUint(d);
    expect(decodeAwarenessUpdate(decoding.readVarUint8Array(d))[0]!.state).toMatchObject({
      user: me,
    });
    p.destroy();
  });

  it("yerel düzenleme gönderilir; salt okunurken gönderilmez", () => {
    const p = provider();
    const ws = FakeSocket.last;
    ws.open();
    ws.receive(hello());
    const before = ws.binary.length;
    p.doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [new Y.XmlElement("paragraph")]);
    expect(ws.binary.length).toBe(before + 1);
    expect(decodeUpdate(ws.binary.at(-1)!)).not.toBeNull();
    ws.receive(JSON.stringify({ t: "rol", readOnly: true }));
    expect(p.getSnapshot().readOnly).toBe(true);
    p.doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [new Y.XmlElement("paragraph")]);
    expect(ws.binary.length).toBe(before + 1);
    p.destroy();
  });

  it("hoş geldinden önce gelen ikili ileti işlenmez; belge kimliği değişince sıfırlanır", () => {
    const onReset = vi.fn();
    const p = provider({ onReset });
    let ws = FakeSocket.last;
    ws.open();
    ws.receive(hello("d1"));
    // Kopma ve yeniden bağlanma; sunucu belgeyi sıfırlamış (yeni kimlik).
    ws.serverClose(1006);
    vi.advanceTimersByTime(500);
    ws = FakeSocket.last;
    ws.open();
    const server = new Y.Doc();
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(e, server);
    ws.receive(encoding.toUint8Array(e));
    expect(ws.binary).toHaveLength(0); // eski belge gönderilmedi
    ws.receive(hello("d2"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(ws.binary).toHaveLength(0);
    ws.receive(JSON.stringify({ t: "sifirla" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    p.destroy();
  });

  it("sifirla iletisi sağlayıcıyı durdurur", () => {
    const onReset = vi.fn();
    const p = provider({ onReset });
    FakeSocket.last.open();
    FakeSocket.last.receive(hello());
    FakeSocket.last.receive(JSON.stringify({ t: "sifirla" }));
    expect(onReset).toHaveBeenCalled();
    expect(FakeSocket.last.closedWith).not.toBeNull();
    p.destroy();
  });

  it("varlık: diğer kişiler listelenir, sorguya yanıt verilir, kopunca liste boşalır", () => {
    const p = provider();
    const ws = FakeSocket.last;
    ws.open();
    ws.receive(hello());
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      e,
      encodeAwarenessUpdate([
        { clientID: 99, clock: 1, state: { user: { id: "u2", name: "Mehmet", color: "#000" } } },
      ]),
    );
    ws.receive(encoding.toUint8Array(e));
    expect(p.getSnapshot().peers.map((x) => x.name)).toEqual(["Mehmet"]);
    const sent = ws.binary.length;
    const q = encoding.createEncoder();
    encoding.writeVarUint(q, MESSAGE_QUERY_AWARENESS);
    ws.receive(encoding.toUint8Array(q));
    expect(ws.binary.length).toBe(sent + 1);
    p.setFocus("t1");
    expect(p.awareness.getLocalState()).toMatchObject({ focus: { taskId: "t1" } });
    p.setFocus("t1");
    ws.serverClose(1006);
    expect(p.getSnapshot().peers).toEqual([]);
    expect(p.getSnapshot().status).toBe("cevrimdisi");
    p.destroy();
  });

  it("uygulama iletileri: görevler, not alanları, kaydedildi, hata", async () => {
    const onTasks = vi.fn();
    const onMeta = vi.fn();
    const onError = vi.fn();
    const p = provider({ kind: "todo", onTasks, onMeta, onError });
    const ws = FakeSocket.last;
    ws.open();
    ws.receive(hello("d1", { kind: "todo" }));
    expect(p.getSnapshot().synced).toBe(true);
    expect(ws.binary.every((b) => b[0] !== MESSAGE_SYNC)).toBe(true);
    ws.receive(JSON.stringify({ t: "gorevler", seq: 1, tasks: [], assignees: {}, by: "u2" }));
    expect(onTasks).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 }));
    ws.receive(JSON.stringify({ t: "not", by: "u2", title: "Yeni" }));
    expect(onMeta).toHaveBeenCalledWith({ by: "u2", title: "Yeni" });
    ws.receive(JSON.stringify({ t: "hata", code: "salt_okunur", message: "m" }));
    expect(onError).toHaveBeenCalledWith("m");
    ws.receive("bozuk");
    const flushed = p.flush();
    expect(ws.json.at(-1)).toEqual({ t: "kaydet" });
    ws.receive(JSON.stringify({ t: "kaydedildi", at: 42 }));
    await flushed;
    expect(p.getSnapshot().lastSavedAt).toBe(42);
    p.destroy();
    await expect(p.flush()).resolves.toBeUndefined();
  });

  it("kaydet yanıtı gelmezse zaman aşımıyla çözülür; close kaydeder ve kapatır", async () => {
    const p = provider();
    FakeSocket.last.open();
    FakeSocket.last.receive(hello());
    const flushed = p.flush(100);
    vi.advanceTimersByTime(100);
    await flushed;
    const closing = p.close(50);
    vi.advanceTimersByTime(50);
    await closing;
    expect(FakeSocket.last.closedWith).not.toBeNull();
  });

  /** Sunucunun eşitleme adım 1'i (hoş geldinden hemen sonra gelir). */
  function serverStep1(server: Y.Doc) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(e, server);
    return encoding.toUint8Array(e);
  }

  /** İstemcinin adım 2 yanıtını sunucu belgesine uygular. */
  function applyClientStep2(server: Y.Doc, msg: Uint8Array) {
    const d = decoding.createDecoder(msg);
    expect(decoding.readVarUint(d)).toBe(MESSAGE_SYNC);
    expect(decoding.readVarUint(d)).toBe(syncProtocol.messageYjsSyncStep2);
    Y.applyUpdate(server, decoding.readVarUint8Array(d));
  }

  function roomWith(html: string) {
    const server = new Y.Doc();
    seedNoteYDoc(server, html);
    const seed = encodeCollabSeed("d1", Y.encodeStateAsUpdate(server))!;
    return { server, seed };
  }

  /** Belgenin sonuna metin ekler (editörde yazmak gibi). */
  function typeAtEnd(doc: Y.Doc, text: string) {
    const paragraph = doc.getXmlFragment(NOTE_FRAGMENT).get(0) as Y.XmlElement;
    const node = paragraph.get(0) as Y.XmlText;
    node.insert(node.length, text);
  }

  it("tohumla başlayan belge bağlantıdan önce düzenlenebilir; yazılanlar hoş geldinde gider, içerik çoğalmaz", () => {
    const { server, seed } = roomWith("<p>İlk satır</p>");
    const p = provider({ initial: seed });
    expect(p.getSnapshot()).toMatchObject({ seeded: true, synced: false, status: "baglaniyor" });
    expect(noteYDocToHtml(p.doc)).toBe("<p>İlk satır</p>");
    const ws = FakeSocket.last;
    // Bağlantı kurulmadan yazılan: gönderilmez, belgede bekler.
    typeAtEnd(p.doc, " eklendi");
    ws.open();
    expect(ws.binary).toHaveLength(0);
    ws.receive(hello("d1"));
    ws.receive(serverStep1(server));
    const step2 = ws.binary.find((b) => {
      const d = decoding.createDecoder(b);
      return decoding.readVarUint(d) === MESSAGE_SYNC && decoding.readVarUint(d) === 1;
    })!;
    applyClientStep2(server, step2);
    // İstemcinin adım 1'ine sunucu yanıtı: eşitlenir, hiçbir şey iki kez görünmez.
    const clientStep1 = ws.binary.find((b) => b[0] === MESSAGE_SYNC && b[1] === 0)!;
    ws.receive(serverStep2(server, clientStep1));
    expect(p.getSnapshot().synced).toBe(true);
    expect(noteYDocToHtml(server)).toBe("<p>İlk satır eklendi</p>");
    expect(noteYDocToHtml(p.doc)).toBe("<p>İlk satır eklendi</p>");
    p.destroy();
  });

  it("oda arada sıfırlandıysa (belge kimliği farklı) tohum atılır, eski belge gönderilmez", () => {
    const { seed } = roomWith("<p>eski</p>");
    const onReset = vi.fn();
    const p = provider({ initial: seed, onReset });
    typeAtEnd(p.doc, "!");
    FakeSocket.last.open();
    FakeSocket.last.receive(hello("d2"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(FakeSocket.last.binary).toHaveLength(0);
    p.destroy();
  });

  it("bozuk ya da yapılacaklar notunun tohumu yok sayılır; ilk eşitleme beklenir", () => {
    const bad = provider({ initial: { docId: "d1", state: "%%%" } });
    expect(bad.getSnapshot().seeded).toBe(false);
    bad.destroy();
    const { seed } = roomWith("<p>x</p>");
    const todo = provider({ kind: "todo", initial: seed });
    expect(todo.getSnapshot().seeded).toBe(false);
    todo.destroy();
    const garbage = provider({ initial: { docId: "d1", state: btoa("çöp veri") } });
    expect(garbage.getSnapshot().seeded).toBe(false);
    garbage.destroy();
  });

  it("autoStart kapalıyken bağlantı start ile açılır (bir kez)", () => {
    const p = provider({ autoStart: false });
    expect(FakeSocket.all).toHaveLength(0);
    p.start();
    p.start();
    expect(FakeSocket.all).toHaveLength(1);
    expect(p.isDestroyed).toBe(false);
    p.destroy();
    expect(p.isDestroyed).toBe(true);
    p.start();
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("kapanırken bağlantıdan önce yazılanların gitmesi beklenir", async () => {
    const { server, seed } = roomWith("<p>a</p>");
    const p = provider({ initial: seed });
    typeAtEnd(p.doc, "b");
    const ws = FakeSocket.last;
    let closed = false;
    void p.close().then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(100);
    expect(closed).toBe(false);
    ws.open();
    ws.receive(hello("d1"));
    ws.receive(serverStep1(server));
    await vi.advanceTimersByTimeAsync(0);
    // Gitti; şimdi kaydet istenir.
    expect(ws.json).toContainEqual({ t: "kaydet" });
    ws.receive(JSON.stringify({ t: "kaydedildi", at: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toBe(true);
  });

  it("bağlantı hiç kurulamazsa kapanış süre sınırında biter", async () => {
    const { seed } = roomWith("<p>a</p>");
    const p = provider({ initial: seed });
    typeAtEnd(p.doc, "b");
    let closed = false;
    void p.close(300, 600).then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(599);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(closed).toBe(true);
    expect(p.isDestroyed).toBe(true);
  });

  it("abonelik ve yeniden bağlanma", () => {
    const p = provider();
    const listener = vi.fn();
    const off = p.subscribe(listener);
    FakeSocket.last.open();
    FakeSocket.last.receive(hello());
    expect(listener).toHaveBeenCalled();
    off();
    p.reconnect();
    expect(FakeSocket.all).toHaveLength(2);
    p.destroy();
    p.destroy();
  });
});

/* ------------------------------------------------------------------ */
/* Görev eşitleyicisi: uzak durum                                        */
/* ------------------------------------------------------------------ */

describe("görev eşitleyicisi: canlı yayın", () => {
  const t = (id: string, title: string) => makeTask(id, null, 0, { title });
  const A = "11111111-1111-4111-8111-111111111111";

  it("eski numaralı yayın yok sayılır; yeni yayın benimsenir", () => {
    const seen: string[] = [];
    const sync = createTaskSync({
      send: vi.fn(),
      reload: vi.fn(),
      onTasks: (tasks) => seen.push(tasks[0]!.title),
    });
    sync.remote({ tasks: [t(A, "iki")], assignees: {}, seq: 2 });
    sync.remote({ tasks: [t(A, "bir")], assignees: {}, seq: 1 });
    expect(seen).toEqual(["iki"]);
    expect(sync.seq).toBe(2);
  });

  it("gönderilmemiş yazım yayının üstüne yeniden uygulanır (ezilmez)", () => {
    const seen: string[] = [];
    const assignees: unknown[] = [];
    const sync = createTaskSync({
      send: vi.fn(),
      reload: vi.fn(),
      onTasks: (tasks) => seen.push(tasks[0]!.title),
      onAssignees: (a) => assignees.push(a),
    });
    sync.push([{ op: "update", id: A, title: "yerel" }]);
    sync.remote({ tasks: [t(A, "uzak")], assignees: { [A]: ["u2"] }, seq: 1 });
    expect(seen).toEqual(["yerel"]);
    expect(assignees).toEqual([{ [A]: ["u2"] }]);
    sync.dispose();
  });

  it("gönderilmemiş işlem artık uygulanamıyorsa kuyruk boşalır, uzak durum gösterilir", () => {
    const seen: number[] = [];
    const onConflict = vi.fn();
    const sync = createTaskSync({
      send: vi.fn(),
      reload: vi.fn(),
      onTasks: (tasks) => seen.push(tasks.length),
      onConflict,
    });
    sync.push([{ op: "update", id: A, title: "yerel" }]);
    sync.remote({ tasks: [], assignees: {}, seq: 1 });
    expect(onConflict).toHaveBeenCalledWith(409);
    expect(seen).toEqual([0]);
    expect(sync.pending).toBe(false);
  });

  it("istek uçarken gelen daha yeni yayın, yanıtın yerine kullanılır", async () => {
    let release: (r: unknown) => void = () => {};
    const send = vi.fn(() => new Promise((r) => (release = r)));
    const seen: string[] = [];
    const sync = createTaskSync({
      send: send as never,
      reload: vi.fn(),
      onTasks: (tasks) => seen.push(tasks[0]?.title ?? "-"),
    });
    sync.push([{ op: "complete", id: A }]);
    expect(send).toHaveBeenCalledTimes(1);
    // Başkasının yazımı (seq 2) bizim isteğimizden (seq 1) sonra sıraya girdi.
    sync.remote({ tasks: [t(A, "başkası")], assignees: {}, seq: 2 });
    sync.remote({ tasks: [t(A, "daha eski")], assignees: {}, seq: 1 });
    expect(seen).toEqual([]);
    const idle = sync.whenIdle();
    release({ ok: true, tasks: [t(A, "bizim")], seq: 1 });
    await idle;
    expect(seen).toEqual(["başkası"]);
    expect(sync.seq).toBe(2);
  });

  it("yanıt yayından yeniyse yanıt kullanılır; ağ hatasında bekleyen yayın benimsenir", async () => {
    let release: (r: unknown) => void = () => {};
    let fail = false;
    const send = vi.fn(() => new Promise((resolve, reject) => (release = fail ? reject : resolve)));
    const seen: string[] = [];
    const sync = createTaskSync({
      send: send as never,
      reload: vi.fn(),
      onTasks: (tasks) => seen.push(tasks[0]?.title ?? "-"),
    });
    sync.push([{ op: "complete", id: A }]);
    sync.remote({ tasks: [t(A, "eski yayın")], assignees: {}, seq: 1 });
    const idle = sync.whenIdle();
    release({ ok: true, tasks: [t(A, "yanıt")], seq: 3 });
    await idle;
    expect(seen.at(-1)).toBe("yanıt");
    fail = true;
    sync.push([{ op: "uncomplete", id: A }]);
    sync.remote({ tasks: [t(A, "yayın 4")], assignees: {}, seq: 4 });
    release(new Error("ağ"));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toBe("yayın 4");
    sync.dispose();
  });
});
