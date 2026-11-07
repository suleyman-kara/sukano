import { describe, expect, it } from "vitest";
import {
  applyAwarenessEntries,
  awarenessSnapshot,
  decodeAwarenessUpdate,
  encodeAwarenessUpdate,
  mergePresence,
  parsePresenceState,
  peersOnTask,
  removalEntries,
  samePeers,
  sanitizeAwarenessEntries,
  type AwarenessMap,
} from "~/domain/realtime/presence";
import { Awareness, encodeAwarenessUpdate as yEncode } from "y-protocols/awareness";
import * as Y from "yjs";

const user = (id: string, name: string, color = "#123456") => ({ id, name, color });

describe("farkındalık tel biçimi", () => {
  it("y-protocols'un ürettiği güncellemeyi çözer ve aynı baytları üretir", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({ user: user("u1", "Ayşe"), focus: { taskId: "t1" } });
    const update = yEncode(awareness, [doc.clientID]);
    const entries = decodeAwarenessUpdate(update);
    expect(entries).toEqual([
      {
        clientID: doc.clientID,
        clock: awareness.meta.get(doc.clientID)!.clock,
        state: { user: user("u1", "Ayşe"), focus: { taskId: "t1" } },
      },
    ]);
    expect(encodeAwarenessUpdate(entries)).toEqual(update);
    awareness.destroy();
  });

  it("bozuk JSON durumu null (ayrılma) sayılır", () => {
    const update = encodeAwarenessUpdate([{ clientID: 1, clock: 1, state: { a: 1 } }]);
    // JSON'u bozan bir bayt: '{' → '['
    const broken = Uint8Array.from(update);
    broken[broken.indexOf("{".charCodeAt(0))] = "[".charCodeAt(0);
    expect(decodeAwarenessUpdate(broken)[0]!.state).toBeNull();
  });
});

describe("sunucu tarafı varlık", () => {
  it("kullanıcı bilgisi oturumdakiyle değiştirilir; diğer alanlar korunur", () => {
    const out = sanitizeAwarenessEntries(
      [
        {
          clientID: 1,
          clock: 3,
          state: { user: user("başkası", "Sahte"), focus: { taskId: "x" } },
        },
        { clientID: 2, clock: 1, state: null },
        { clientID: 3, clock: 1, state: "metin" },
      ],
      user("u1", "Ayşe"),
    );
    expect(out[0]!.state).toEqual({ user: user("u1", "Ayşe"), focus: { taskId: "x" } });
    expect(out[1]!.state).toBeNull();
    expect(out[2]!.state).toEqual({ user: user("u1", "Ayşe") });
  });

  it("çok büyük durum atılır (ayrılma sayılır)", () => {
    const out = sanitizeAwarenessEntries(
      [{ clientID: 1, clock: 1, state: { cursor: "x".repeat(5000) } }],
      user("u1", "A"),
    );
    expect(out[0]!.state).toBeNull();
  });

  it("yeni saat kazanır, eski saat yok sayılır, ayrılma silinir", () => {
    const map: AwarenessMap = new Map();
    expect(applyAwarenessEntries(map, [{ clientID: 1, clock: 2, state: { a: 1 } }])).toHaveLength(
      1,
    );
    expect(applyAwarenessEntries(map, [{ clientID: 1, clock: 1, state: { a: 0 } }])).toHaveLength(
      0,
    );
    expect(map.get(1)).toEqual({ clock: 2, state: { a: 1 } });
    // Aynı saatte null ayrılma kabul edilir.
    expect(applyAwarenessEntries(map, [{ clientID: 1, clock: 2, state: null }])).toHaveLength(1);
    expect(map.has(1)).toBe(false);
    // Olmayan istemcinin ayrılması da yayınlanır (zararsız).
    expect(applyAwarenessEntries(map, [{ clientID: 9, clock: 1, state: null }])).toHaveLength(1);
  });

  it("anlık görüntü ve kapanan bağlantının ayrılma girişleri", () => {
    const map: AwarenessMap = new Map([
      [1, { clock: 4, state: { a: 1 } }],
      [2, { clock: 1, state: { b: 1 } }],
    ]);
    expect(awarenessSnapshot(map)).toEqual([
      { clientID: 1, clock: 4, state: { a: 1 } },
      { clientID: 2, clock: 1, state: { b: 1 } },
    ]);
    expect(removalEntries(map, [1, 7])).toEqual([{ clientID: 1, clock: 5, state: null }]);
  });
});

describe("varlık listesi (mergePresence)", () => {
  it("geçersiz durumları atlar, kendini çıkarır, ada göre (Türkçe) sıralar", () => {
    const peers = mergePresence(
      [
        [10, { user: user("u3", "Zeynep") }],
        [11, { user: user("u2", "Çağla") }],
        [12, { user: user("u4", "Can") }],
        [13, { foo: 1 }],
        [14, null],
        [15, { user: { id: "", name: "Boş" } }],
        [16, { user: user("me", "Ben") }],
      ],
      { selfClientId: 16 },
    );
    expect(peers.map((p) => p.name)).toEqual(["Can", "Çağla", "Zeynep"]);
  });

  it("aynı kişinin sekmeleri tek kayıt olur; odaklar birleşir; ad en büyük istemciden", () => {
    const peers = mergePresence([
      [5, { user: user("u1", "Ayşe Eski"), focus: { taskId: "b" } }],
      [9, { user: { ...user("u1", "Ayşe"), avatarUrl: "/a.png" }, focus: { taskId: "a" } }],
      [7, { user: user("u1", "Ayşe Orta"), focus: { taskId: "a" } }],
    ]);
    expect(peers).toEqual([
      {
        userId: "u1",
        name: "Ayşe",
        color: "#123456",
        avatarUrl: "/a.png",
        clientIds: [5, 7, 9],
        focusTaskIds: ["a", "b"],
      },
    ]);
  });

  it("selfUserId verilirse kişinin diğer sekmeleri de listelenmez", () => {
    const peers = mergePresence(
      [
        [1, { user: user("me", "Ben") }],
        [2, { user: user("u2", "Mehmet") }],
      ],
      { selfClientId: 99, selfUserId: "me" },
    );
    expect(peers.map((p) => p.userId)).toEqual(["u2"]);
  });

  it("aynı adda kişiler kimliğe göre sıralanır; renk yoksa varsayılan", () => {
    const peers = mergePresence([
      [1, { user: { id: "b", name: "Deniz" } }],
      [2, { user: { id: "a", name: "deniz", color: "" } }],
    ]);
    expect(peers.map((p) => p.userId)).toEqual(["a", "b"]);
    expect(peers[0]!.color).toBe("#597895");
  });

  it("görevdeki kişiler ve liste eşitliği", () => {
    const a = mergePresence([
      [1, { user: user("u1", "A"), focus: { taskId: "t" } }],
      [2, { user: user("u2", "B") }],
    ]);
    expect(peersOnTask(a, "t").map((p) => p.userId)).toEqual(["u1"]);
    expect(
      samePeers(
        a,
        mergePresence([
          [2, { user: user("u2", "B") }],
          [1, { user: user("u1", "A"), focus: { taskId: "t" } }],
        ]),
      ),
    ).toBe(true);
    expect(samePeers(a, [])).toBe(false);
  });

  it("durum doğrulama: imleç korunur, geçersiz odak null olur", () => {
    expect(
      parsePresenceState({ user: user("u", "A"), focus: { taskId: 3 }, cursor: { anchor: 1 } }),
    ).toEqual({
      user: user("u", "A"),
      focus: null,
      cursor: { anchor: 1 },
    });
    expect(parsePresenceState({ user: { id: "u", name: 5 } })).toBeNull();
    expect(parsePresenceState([])).toBeNull();
  });
});
