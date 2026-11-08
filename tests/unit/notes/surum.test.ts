import { describe, expect, it } from "vitest";
import {
  MAX_VERSIONS,
  VERSION_WINDOW_MS,
  decideVersionWrite,
  versionsToPrune,
} from "~/domain/notes/versions";

const t0 = new Date("2026-11-05T11:00:00Z");
const after = (ms: number) => new Date(t0.getTime() + ms);

describe("sürüm penceresi", () => {
  it("hiç sürüm yoksa yeni sürüm oluşturulur", () => {
    expect(decideVersionWrite(null, "ayse", t0)).toEqual({ action: "create" });
  });

  it("aynı kişi 5 dakika içinde düzenlerse son sürüm güncellenir", () => {
    const latest = { id: "v1", authorId: "ayse", createdAt: t0 };
    expect(decideVersionWrite(latest, "ayse", after(VERSION_WINDOW_MS - 1))).toEqual({
      action: "update",
      versionId: "v1",
    });
  });

  it("5 dakika dolunca yeni sürüm oluşturulur", () => {
    const latest = { id: "v1", authorId: "ayse", createdAt: t0 };
    expect(decideVersionWrite(latest, "ayse", after(VERSION_WINDOW_MS))).toEqual({
      action: "create",
    });
  });

  it("başka bir kişi düzenlerse pencere içinde bile yeni sürüm oluşturulur", () => {
    const latest = { id: "v1", authorId: "ayse", createdAt: t0 };
    expect(decideVersionWrite(latest, "mehmet", after(1000))).toEqual({ action: "create" });
  });

  it("geri yükleme her zaman yeni sürüm olarak kaydedilir", () => {
    const latest = { id: "v1", authorId: "ayse", createdAt: t0 };
    expect(decideVersionWrite(latest, "ayse", after(1000), { forceNew: true })).toEqual({
      action: "create",
    });
  });

  it("yazarı silinmiş sürüm güncellenmez", () => {
    const latest = { id: "v1", authorId: null, createdAt: t0 };
    expect(decideVersionWrite(latest, "ayse", after(1000))).toEqual({ action: "create" });
  });
});

describe("sürüm sınırı", () => {
  const versions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `v${i}`, createdAt: after(i * 1000) }));

  it(`en çok ${MAX_VERSIONS} sürüm tutulur; fazlası en eskiden silinir`, () => {
    expect(versionsToPrune(versions(MAX_VERSIONS))).toEqual([]);
    expect(versionsToPrune(versions(MAX_VERSIONS + 2))).toEqual(["v0", "v1"]);
  });

  it("girdi sırası önemli değildir", () => {
    const list = versions(MAX_VERSIONS + 1).reverse();
    expect(versionsToPrune(list)).toEqual(["v0"]);
  });

  it("sınır parametreyle değiştirilebilir", () => {
    expect(versionsToPrune(versions(4), 2)).toEqual(["v0", "v1"]);
  });
});
