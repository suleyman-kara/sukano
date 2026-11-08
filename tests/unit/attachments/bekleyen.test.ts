import { describe, expect, it } from "vitest";
import {
  attachmentsReducer as reduce,
  EMPTY_ATTACHMENTS,
  pruneAttachments,
  usedSlots,
  visibleAttachments,
  type AttachmentView,
} from "~/domain/attachments/pending";

const a = (id: string): AttachmentView => ({
  id,
  name: `${id}.png`,
  size: 10,
  contentType: "image/png",
  kind: "image",
});

describe("bekleyen yüklemeler", () => {
  it("yükleme başlar, ilerler ve bitince eklenenlere geçer", () => {
    let s = reduce(EMPTY_ATTACHMENTS, { type: "basla", key: "k", name: "a.png", size: 100 });
    expect(s.pending).toEqual([
      { key: "k", name: "a.png", size: 100, loaded: 0, status: "yukleniyor" },
    ]);
    s = reduce(s, { type: "ilerle", key: "k", loaded: 40 });
    expect(s.pending[0]?.loaded).toBe(40);
    s = reduce(s, { type: "bitti", key: "k", attachment: a("x") });
    expect(s.pending).toEqual([]);
    expect(s.added).toEqual([a("x")]);
  });

  it("ağ hatası tekrar denenebilir; yeniden denemede ilerleme sıfırlanır", () => {
    let s = reduce(EMPTY_ATTACHMENTS, { type: "basla", key: "k", name: "a.png", size: 100 });
    s = reduce(s, { type: "ilerle", key: "k", loaded: 70 });
    s = reduce(s, { type: "hata", key: "k", error: "Yüklenemedi", retryable: true });
    expect(s.pending[0]).toMatchObject({ status: "hata", error: "Yüklenemedi", retryable: true });
    s = reduce(s, { type: "yeniden", key: "k" });
    expect(s.pending[0]).toMatchObject({ status: "yukleniyor", loaded: 0, retryable: false });
    expect(s.pending[0]?.error).toBeUndefined();
  });

  it("kural hatası tekrar denenemez ve Kaldır ile listeden çıkar", () => {
    let s = reduce(EMPTY_ATTACHMENTS, { type: "basla", key: "k", name: "a.mov", size: 100 });
    s = reduce(s, { type: "hata", key: "k", error: "48 MB · dosya başına en fazla 10 MB" });
    expect(s.pending[0]?.retryable).toBe(false);
    s = reduce(s, { type: "vazgec", key: "k" });
    expect(s.pending).toEqual([]);
  });

  it("kaldırılan ek gizlenir; istek başarısızsa geri gelir", () => {
    let s = reduce(EMPTY_ATTACHMENTS, { type: "kaldir", id: "x" });
    expect(reduce(s, { type: "kaldir", id: "x" })).toBe(s);
    expect(visibleAttachments([a("x"), a("y")], s).map((v) => v.id)).toEqual(["y"]);
    s = reduce(s, { type: "kaldirma-geri", id: "x" });
    expect(visibleAttachments([a("x"), a("y")], s).map((v) => v.id)).toEqual(["x", "y"]);
  });
});

describe("gösterilen ekler", () => {
  it("sunucu listesine girmemiş eklenenler sona eklenir, ikinci kez gösterilmez", () => {
    const s = { ...EMPTY_ATTACHMENTS, added: [a("y"), a("z")] };
    expect(visibleAttachments([a("x"), a("y")], s).map((v) => v.id)).toEqual(["x", "y", "z"]);
  });

  it("sunucuya ulaşan eklenenler durumdan atılır, değişiklik yoksa aynı nesne döner", () => {
    const s = { ...EMPTY_ATTACHMENTS, added: [a("y"), a("z")] };
    expect(pruneAttachments([a("y")], s).added).toEqual([a("z")]);
    expect(pruneAttachments([a("q")], s)).toBe(s);
    expect(reduce(s, { type: "esitle", server: [a("z")] }).added).toEqual([a("y")]);
  });

  it("dolu yer sayısı gösterilenlerle süren yüklemelerin toplamıdır", () => {
    let s = reduce(EMPTY_ATTACHMENTS, { type: "basla", key: "1", name: "a", size: 1 });
    s = reduce(s, { type: "basla", key: "2", name: "b", size: 1 });
    s = reduce(s, { type: "hata", key: "2", error: "x" });
    expect(usedSlots([a("x")], s)).toBe(2);
  });
});
