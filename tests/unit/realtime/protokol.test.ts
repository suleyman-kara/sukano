import { describe, expect, it } from "vitest";
import { backoffSchedule, reconnectDelay } from "~/domain/realtime/backoff";
import { decideCollabVersionWrite, VERSION_WINDOW_MS } from "~/domain/notes/versions";
import {
  channelName,
  isFatalClose,
  noteLivePath,
  parseChannelServerMessage,
  parseLivePath,
  parseNoteClientMessage,
  parseNoteServerMessage,
  PERSONAL_CHANNEL_PATH,
  projectChannelPath,
} from "~/domain/realtime/protocol";

describe("yeniden bağlanma bekleme çizelgesi", () => {
  it("üstel artar ve 15 sn'de tavan yapar", () => {
    expect(backoffSchedule(8)).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });

  it("titreşim süreyi ±%20 aralığında dağıtır, tavanı aşmaz", () => {
    expect(reconnectDelay(0, {}, () => 0)).toBe(400);
    expect(reconnectDelay(0, {}, () => 1)).toBe(600);
    expect(reconnectDelay(0, {}, () => 0.5)).toBe(500);
    expect(reconnectDelay(10, {}, () => 1)).toBe(15000);
  });

  it("geçersiz deneme sayısı 0 sayılır; seçenekler uygulanır", () => {
    expect(reconnectDelay(-3, { jitter: 0 })).toBe(500);
    expect(reconnectDelay(Number.NaN, { jitter: 0 })).toBe(500);
    expect(reconnectDelay(2.7, { jitter: 0 })).toBe(2000);
    expect(backoffSchedule(3, { base: 100, factor: 3, max: 500 })).toEqual([100, 300, 500]);
    expect(reconnectDelay(0, { jitter: 5 }, () => 0)).toBe(0);
  });
});

describe("canlı yollar", () => {
  it("not, proje ve kişisel kanal yollarını çözer", () => {
    expect(parseLivePath(noteLivePath("not-1"))).toEqual({ kind: "note", noteId: "not-1" });
    expect(parseLivePath(projectChannelPath("p_1"))).toEqual({ kind: "project", projectId: "p_1" });
    expect(parseLivePath(PERSONAL_CHANNEL_PATH)).toEqual({ kind: "personal" });
    expect(parseLivePath("/api/notlar/a b/canli")).toBeNull();
    expect(parseLivePath("/api/notlar")).toBeNull();
  });

  it("kanal adları", () => {
    expect(channelName({ kind: "project", projectId: "p" })).toBe("proje:p");
    expect(channelName({ kind: "personal", userId: "u" })).toBe("kisi:u");
  });

  it("yalnızca erişim kapanışı ölümcüldür", () => {
    expect(isFatalClose(4404)).toBe(true);
    expect(isFatalClose(4009)).toBe(false);
    expect(isFatalClose(1006)).toBe(false);
  });
});

describe("JSON ileti doğrulama", () => {
  it("geçerli sunucu iletilerini kabul eder", () => {
    const hello = {
      t: "hosgeldin",
      docId: "d",
      kind: "text",
      readOnly: false,
      user: { id: "u", name: "A", color: "#000" },
      seq: 0,
    };
    expect(parseNoteServerMessage(JSON.stringify(hello))).toEqual(hello);
    const tasks = { t: "gorevler", seq: 2, tasks: [], assignees: { a: ["u"] }, by: "u" };
    expect(parseNoteServerMessage(JSON.stringify(tasks))).toEqual(tasks);
    expect(parseNoteServerMessage('{"t":"not","by":"u","title":"x"}')).toEqual({
      t: "not",
      by: "u",
      title: "x",
    });
    expect(parseNoteServerMessage('{"t":"kaydedildi","at":5}')).toEqual({ t: "kaydedildi", at: 5 });
    expect(parseNoteServerMessage('{"t":"sifirla"}')).toEqual({ t: "sifirla" });
    expect(parseNoteServerMessage('{"t":"rol","readOnly":true}')).toEqual({
      t: "rol",
      readOnly: true,
    });
    expect(parseNoteServerMessage('{"t":"hata","code":"salt_okunur","message":"m"}')).toEqual({
      t: "hata",
      code: "salt_okunur",
      message: "m",
    });
  });

  it("bozuk ya da eksik iletileri reddeder", () => {
    for (const raw of [
      "değil-json",
      "[]",
      '{"t":"bilinmez"}',
      '{"t":"hosgeldin","docId":"d","kind":"x","readOnly":false,"user":{"id":"u"},"seq":0}',
      '{"t":"gorevler","seq":1,"tasks":[],"assignees":{"a":[1]},"by":"u"}',
      '{"t":"not"}',
      '{"t":"kaydedildi"}',
      '{"t":"rol"}',
      '{"t":"hata","code":"başka","message":"m"}',
    ]) {
      expect(parseNoteServerMessage(raw)).toBeNull();
    }
  });

  it("istemci iletileri", () => {
    expect(parseNoteClientMessage('{"t":"kaydet"}')).toEqual({ t: "kaydet" });
    expect(parseNoteClientMessage('{"t":"ping"}')).toEqual({ t: "ping" });
    expect(parseNoteClientMessage('{"t":"x"}')).toBeNull();
    expect(parseNoteClientMessage("{")).toBeNull();
  });

  it("kanal iletileri", () => {
    expect(parseChannelServerMessage('{"t":"hosgeldin","seq":3}')).toEqual({
      t: "hosgeldin",
      seq: 3,
    });
    const event = { type: "renk", noteId: "n", color: "mavi", by: "u", at: 1 };
    expect(parseChannelServerMessage(JSON.stringify({ t: "olay", seq: 4, event }))).toEqual({
      t: "olay",
      seq: 4,
      event,
    });
    expect(
      parseChannelServerMessage(JSON.stringify({ t: "olay", seq: 4, event: { type: "renk" } })),
    ).toBeNull();
    expect(parseChannelServerMessage('{"t":"olay"}')).toBeNull();
    expect(parseChannelServerMessage('{"t":"x","seq":1}')).toBeNull();
  });
});

describe("ortak düzenlemede sürüm kararı", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  const latest = (authorId: string | null, agoMs: number) => ({
    id: "v1",
    authorId,
    createdAt: new Date(now.getTime() - agoMs),
  });

  it("düzenleyen yoksa sürüm yazılmaz", () => {
    expect(decideCollabVersionWrite(latest("a", 0), [], now)).toEqual({ action: "none" });
  });

  it("ilk sürüm en son düzenleyen adına", () => {
    expect(decideCollabVersionWrite(null, ["a", "b"], now)).toEqual({
      action: "create",
      authorId: "b",
    });
  });

  it("son sürümün sahibi bu aralıkta düzenlediyse ve pencere açıksa güncellenir", () => {
    expect(decideCollabVersionWrite(latest("a", 1000), ["a", "b"], now)).toEqual({
      action: "update",
      versionId: "v1",
      authorId: "a",
    });
  });

  it("pencere geçtiyse ya da sahip düzenlemediyse yeni sürüm", () => {
    expect(decideCollabVersionWrite(latest("a", VERSION_WINDOW_MS), ["a"], now)).toEqual({
      action: "create",
      authorId: "a",
    });
    expect(decideCollabVersionWrite(latest("c", 0), ["a", "b"], now)).toEqual({
      action: "create",
      authorId: "b",
    });
    expect(decideCollabVersionWrite(latest(null, 0), ["a"], now)).toEqual({
      action: "create",
      authorId: "a",
    });
  });
});
