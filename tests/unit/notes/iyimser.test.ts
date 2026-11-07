import { describe, expect, it } from "vitest";
import { applyPendingIntents, type NoteCardData } from "~/domain/notes/optimistic";

const card = (id: string, position: number, extra: Partial<NoteCardData> = {}): NoteCardData => ({
  id,
  kind: "text",
  title: id.toUpperCase(),
  color: "default",
  pinned: false,
  position,
  preview: "",
  tasks: [],
  moreTasks: 0,
  updatedAt: "2026-11-07T00:00:00.000Z",
  archivedAt: null,
  trashedAt: null,
  ...extra,
});

const base = [card("a", 0), card("b", 1), card("c", 2, { pinned: true })];
const now = new Date("2026-11-07T10:00:00Z");
const NEW = "0b7a2c4e-1d2f-4a3b-8c9d-0e1f2a3b4c5d";

describe("iyimser arayüz", () => {
  it("arşivlenen ve çöpe atılan not Notlar görünümünden hemen kalkar", () => {
    const out = applyPendingIntents(
      base,
      [
        { intent: "archive", id: "a" },
        { intent: "trash", id: "c" },
      ],
      "notlar",
    );
    expect(out.map((n) => n.id)).toEqual(["b"]);
  });

  it("arşivden çıkarılan not arşiv görünümünden, geri yüklenen not çöpten kalkar", () => {
    expect(applyPendingIntents(base, [{ intent: "unarchive", id: "a" }], "arsiv")).toHaveLength(2);
    expect(applyPendingIntents(base, [{ intent: "restore", id: "a" }], "cop")).toHaveLength(2);
    expect(applyPendingIntents(base, [{ intent: "empty-trash" }], "cop")).toEqual([]);
    expect(applyPendingIntents(base, [{ intent: "empty-trash" }], "notlar")).toHaveLength(3);
  });

  it("renk ve sabitleme anında değişir", () => {
    const out = applyPendingIntents(
      base,
      [
        { intent: "color", id: "a", color: "mor" },
        { intent: "pin", id: "b", pinned: true },
      ],
      "notlar",
    );
    expect(out.find((n) => n.id === "a")!.color).toBe("mor");
    expect(out.find((n) => n.id === "b")!.pinned).toBe(true);
  });

  it("yeni not en üste eklenir, önizlemesi HTML'den üretilir", () => {
    const out = applyPendingIntents(
      base,
      [
        {
          intent: "create",
          id: NEW,
          title: "Yeni",
          bodyHtml: "<p>Gövde</p>",
          color: "sari",
          pinned: false,
        },
      ],
      "notlar",
      now,
    );
    expect(out[0]).toMatchObject({
      id: NEW,
      title: "Yeni",
      preview: "Gövde",
      position: -1,
      color: "sari",
    });
    expect(
      applyPendingIntents(
        base,
        [{ intent: "create", id: NEW, title: "", bodyHtml: "", color: "default", pinned: false }],
        "arsiv",
      ),
    ).toHaveLength(3);
  });

  it("güncelleme başlığı ve önizlemeyi değiştirir", () => {
    const out = applyPendingIntents(
      base,
      [{ intent: "update", id: "a", bodyHtml: "<p>Yeni gövde</p>" }],
      "notlar",
    );
    expect(out[0]).toMatchObject({ title: "A", preview: "Yeni gövde" });
    const out2 = applyPendingIntents(
      base,
      [{ intent: "update", id: "a", title: "Başka" }],
      "notlar",
    );
    expect(out2[0]).toMatchObject({ title: "Başka", preview: "" });
  });

  it("kopya sabitlenmemiş olarak en üste eklenir", () => {
    const out = applyPendingIntents(
      base,
      [{ intent: "duplicate", id: "c", newId: NEW }],
      "notlar",
      now,
    );
    expect(out[0]).toMatchObject({ id: NEW, title: "C", pinned: false, position: -1 });
    expect(
      applyPendingIntents(base, [{ intent: "duplicate", id: "yok", newId: NEW }], "notlar"),
    ).toHaveLength(3);
  });

  it("taşıma yalnızca kendi bölümünde konumu değiştirir", () => {
    const out = applyPendingIntents(
      base,
      [{ intent: "move", id: "b", pinned: false, toIndex: 0 }],
      "notlar",
    );
    const others = out.filter((n) => !n.pinned).sort((x, y) => x.position - y.position);
    expect(others.map((n) => n.id)).toEqual(["b", "a"]);
    expect(out.find((n) => n.id === "c")!.position).toBe(2);
  });
});
