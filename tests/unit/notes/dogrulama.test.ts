import { describe, expect, it } from "vitest";
import {
  MAX_TITLE_LENGTH,
  intentToForm,
  isNoteColor,
  isNoteKind,
  parseNoteIntent,
} from "~/domain/notes/validation";

const UUID = "0b7a2c4e-1d2f-4a3b-8c9d-0e1f2a3b4c5d";

describe("renk ve tür doğrulama", () => {
  it("10 not rengini kabul eder, diğerlerini reddeder", () => {
    for (const c of [
      "default",
      "sari",
      "turuncu",
      "pembe",
      "mor",
      "mavi",
      "turkuaz",
      "yesil",
      "kahve",
      "gri",
    ]) {
      expect(isNoteColor(c)).toBe(true);
    }
    expect(isNoteColor("kirmizi")).toBe(false);
    expect(isNoteColor(3)).toBe(false);
  });

  it("not türü metin ya da yapılacaklardır", () => {
    expect(isNoteKind("text")).toBe(true);
    expect(isNoteKind("todo")).toBe(true);
    expect(isNoteKind("drawing")).toBe(false);
  });
});

describe("not eylemi ayrıştırma", () => {
  it("oluşturma: varsayılan renk ve sabitleme doldurulur", () => {
    expect(parseNoteIntent({ intent: "create", id: UUID, title: "Başlık" })).toEqual({
      ok: true,
      value: {
        intent: "create",
        id: UUID,
        title: "Başlık",
        bodyHtml: "",
        color: "default",
        pinned: false,
      },
    });
  });

  it("oluşturma: kimlik UUID olmalı, renk ve sabitleme geçerli olmalı", () => {
    expect(parseNoteIntent({ intent: "create", id: "market" }).ok).toBe(false);
    expect(parseNoteIntent({ intent: "create", id: UUID, color: "x" }).ok).toBe(false);
    expect(parseNoteIntent({ intent: "create", id: UUID, pinned: "belki" }).ok).toBe(false);
    expect(
      parseNoteIntent({ intent: "create", id: UUID, title: "x".repeat(MAX_TITLE_LENGTH + 1) }).ok,
    ).toBe(false);
  });

  it("güncelleme: en az bir alan gerekir, uzunluk sınırı uygulanır", () => {
    expect(parseNoteIntent({ intent: "update", id: "market" }).ok).toBe(false);
    expect(parseNoteIntent({ intent: "update", id: "market", title: 5 }).ok).toBe(false);
    expect(parseNoteIntent({ intent: "update", id: "market", bodyHtml: "<p>x</p>" })).toEqual({
      ok: true,
      value: { intent: "update", id: "market", title: undefined, bodyHtml: "<p>x</p>" },
    });
  });

  it("renk, sabitleme ve basit eylemler", () => {
    expect(parseNoteIntent({ intent: "color", id: "a", color: "mor" }).ok).toBe(true);
    expect(parseNoteIntent({ intent: "color", id: "a", color: "lila" }).ok).toBe(false);
    expect(parseNoteIntent({ intent: "pin", id: "a", pinned: "true" })).toEqual({
      ok: true,
      value: { intent: "pin", id: "a", pinned: true },
    });
    expect(parseNoteIntent({ intent: "pin", id: "a" }).ok).toBe(false);
    for (const intent of ["archive", "unarchive", "trash", "restore", "delete", "discard"]) {
      expect(parseNoteIntent({ intent, id: "a" })).toEqual({
        ok: true,
        value: { intent, id: "a" },
      });
    }
    expect(parseNoteIntent({ intent: "empty-trash" })).toEqual({
      ok: true,
      value: { intent: "empty-trash" },
    });
  });

  it("kopya için yeni UUID gerekir", () => {
    expect(parseNoteIntent({ intent: "duplicate", id: "a", newId: UUID }).ok).toBe(true);
    expect(parseNoteIntent({ intent: "duplicate", id: "a", newId: "b" }).ok).toBe(false);
  });

  it("taşıma: bölüm ve negatif olmayan tamsayı dizin gerekir", () => {
    expect(parseNoteIntent({ intent: "move", id: "a", pinned: "false", toIndex: "2" })).toEqual({
      ok: true,
      value: { intent: "move", id: "a", pinned: false, toIndex: 2 },
    });
    expect(parseNoteIntent({ intent: "move", id: "a", pinned: "false", toIndex: "-1" }).ok).toBe(
      false,
    );
    expect(parseNoteIntent({ intent: "move", id: "a", pinned: "false", toIndex: "1.5" }).ok).toBe(
      false,
    );
  });

  it("sürüm geri yükleme sürüm kimliği ister", () => {
    expect(parseNoteIntent({ intent: "restore-version", id: "a", versionId: "v1" }).ok).toBe(true);
    expect(parseNoteIntent({ intent: "restore-version", id: "a", versionId: "../" }).ok).toBe(
      false,
    );
  });

  it("geçersiz kimlik ve bilinmeyen eylem reddedilir", () => {
    expect(parseNoteIntent({ intent: "archive", id: "a b" })).toEqual({
      ok: false,
      error: "Geçersiz not kimliği",
    });
    expect(parseNoteIntent({ intent: "uç", id: "a" })).toEqual({
      ok: false,
      error: "Bilinmeyen işlem",
    });
  });

  it("eylem form alanlarına çevrilir; tanımsız alanlar atlanır", () => {
    expect(intentToForm({ intent: "update", id: "a", title: "T" })).toEqual({
      intent: "update",
      id: "a",
      title: "T",
    });
    expect(intentToForm({ intent: "pin", id: "a", pinned: true })).toEqual({
      intent: "pin",
      id: "a",
      pinned: "true",
    });
  });
});

describe("yapılacaklar notu eylemleri", () => {
  it("yapılacaklar notu oluşturma: görev başlıkları JSON dizisi olarak gelir", () => {
    expect(
      parseNoteIntent({
        intent: "create-todo",
        id: UUID,
        title: "Liste",
        tasks: '["Süt","Ekmek"]',
      }),
    ).toEqual({
      ok: true,
      value: {
        intent: "create-todo",
        id: UUID,
        title: "Liste",
        color: "default",
        pinned: false,
        tasks: ["Süt", "Ekmek"],
      },
    });
    const empty = parseNoteIntent({ intent: "create-todo", id: UUID });
    expect(empty.ok && empty.value).toMatchObject({ title: "", tasks: [] });
  });

  it("yapılacaklar notu oluşturma: kimlik, renk, sabitleme ve görevler doğrulanır", () => {
    const bad = (extra: Record<string, unknown>) =>
      parseNoteIntent({ intent: "create-todo", id: UUID, ...extra });
    expect(parseNoteIntent({ intent: "create-todo", id: "market" })).toEqual({
      ok: false,
      error: "Geçersiz not kimliği",
    });
    expect(bad({ title: "x".repeat(MAX_TITLE_LENGTH + 1) })).toEqual({
      ok: false,
      error: "Not çok uzun",
    });
    expect(bad({ color: "neon" })).toEqual({ ok: false, error: "Geçersiz renk" });
    expect(bad({ pinned: "belki" })).toEqual({ ok: false, error: "Geçersiz sabitleme" });
    for (const tasks of ["{", '"x"', "[1]", JSON.stringify(Array(501).fill("a"))]) {
      expect(bad({ tasks })).toEqual({ ok: false, error: "Geçersiz görevler" });
    }
    expect(bad({ tasks: ["dizi", "olarak"] })).toMatchObject({ ok: true });
  });

  it("dönüştürme: hedef tür metin ya da yapılacaklar", () => {
    expect(parseNoteIntent({ intent: "convert", id: "market", to: "text" })).toEqual({
      ok: true,
      value: { intent: "convert", id: "market", to: "text" },
    });
    expect(parseNoteIntent({ intent: "convert", id: "market", to: "resim" })).toEqual({
      ok: false,
      error: "Geçersiz dönüşüm",
    });
  });

  it("görev dizisi form alanına JSON olarak yazılır", () => {
    expect(
      intentToForm({
        intent: "create-todo",
        id: UUID,
        title: "",
        color: "default",
        pinned: false,
        tasks: ["a"],
      }),
    ).toMatchObject({ tasks: '["a"]', pinned: "false" });
  });
});
