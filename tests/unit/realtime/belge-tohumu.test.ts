import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  base64ToBytes,
  bytesToBase64,
  decodeCollabSeed,
  encodeCollabSeed,
  MAX_SEED_BYTES,
} from "~/domain/realtime/collab-seed";
import { noteYDocToHtml, seedNoteYDoc } from "~/domain/realtime/note-doc";

describe("not odası belge tohumu", () => {
  it("oda durumu base64 ile gidip gelir; tohumdan kurulan belge odanınkiyle aynıdır", () => {
    const room = new Y.Doc();
    seedNoteYDoc(room, "<p>Salon duvarı için <strong>sıcak</strong> gri</p>");
    const seed = encodeCollabSeed("d1", Y.encodeStateAsUpdate(room))!;
    expect(seed.docId).toBe("d1");
    const decoded = decodeCollabSeed(seed)!;
    const client = new Y.Doc();
    Y.applyUpdate(client, decoded.state);
    expect(noteYDocToHtml(client)).toBe(noteYDocToHtml(room));
    // Aynı öğeler: odanın durumu yeniden uygulanınca içerik çoğalmaz.
    Y.applyUpdate(client, Y.encodeStateAsUpdate(room));
    expect(noteYDocToHtml(client)).toBe("<p>Salon duvarı için <strong>sıcak</strong> gri</p>");
  });

  it("büyük bayt dizileri parça parça kodlanır", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("kimliksiz, boş ya da çok büyük durum tohumlanmaz", () => {
    expect(encodeCollabSeed("", new Uint8Array([1]))).toBeNull();
    expect(encodeCollabSeed("d1", new Uint8Array())).toBeNull();
    expect(encodeCollabSeed("d1", new Uint8Array(MAX_SEED_BYTES + 1))).toBeNull();
  });

  it("bozuk tohum çözülmez", () => {
    expect(decodeCollabSeed(null)).toBeNull();
    expect(decodeCollabSeed(undefined)).toBeNull();
    expect(decodeCollabSeed({ docId: "", state: "AQ==" })).toBeNull();
    expect(decodeCollabSeed({ docId: "d1", state: "%%%" })).toBeNull();
    expect(decodeCollabSeed({ docId: "d1", state: "" })).toBeNull();
    expect(decodeCollabSeed({ docId: "d1", state: 5 } as never)).toBeNull();
    expect(base64ToBytes("%%%")).toBeNull();
  });
});
