import { describe, expect, it } from "vitest";
import type { NoteCardData } from "~/domain/notes/optimistic";
import {
  applyChannelEvent,
  applyChannelEvents,
  noteIdsOf,
  parseChannelEvent,
  type ChannelEventBody,
} from "~/domain/realtime/grid-events";

const card = (id: string, extra: Partial<NoteCardData> = {}): NoteCardData => ({
  id,
  kind: "text",
  title: id,
  color: "default",
  pinned: false,
  position: 1,
  preview: "",
  tasks: [],
  moreTasks: 0,
  updatedAt: "2026-11-07T10:00:00.000Z",
  archivedAt: null,
  trashedAt: null,
  ...extra,
});

const grid = [
  card("a", { position: 1 }),
  card("b", { position: 2 }),
  card("c", { position: 3 }),
  card("p", { pinned: true, position: 1 }),
];

const ids = (notes: NoteCardData[]) =>
  [...notes]
    .sort((x, y) => x.position - y.position)
    .filter((n) => !n.pinned)
    .map((n) => n.id);

describe("kanal olayı → ızgara yaması", () => {
  it("renk ve sabit yerelde uygulanır, yeniden doğrulama gerekmez", () => {
    const r = applyChannelEvent(grid, { type: "renk", noteId: "a", color: "mavi" }, "notlar");
    expect(r.revalidate).toBe(false);
    expect(r.notes.find((n) => n.id === "a")!.color).toBe("mavi");
    const s = applyChannelEvent(grid, { type: "sabit", noteId: "b", pinned: true }, "notlar");
    expect(s.notes.find((n) => n.id === "b")!.pinned).toBe(true);
    expect(s.revalidate).toBe(false);
  });

  it("görünümde olmayan nota renk/sabit olayı ızgarayı değiştirmez", () => {
    expect(applyChannelEvent(grid, { type: "renk", noteId: "x", color: "mavi" }, "notlar")).toEqual(
      {
        notes: grid,
        revalidate: false,
      },
    );
    expect(
      applyChannelEvent(grid, { type: "sabit", noteId: "x", pinned: true }, "notlar").revalidate,
    ).toBe(false);
  });

  it("sıra olayı notu bölümünde taşır", () => {
    const r = applyChannelEvent(
      grid,
      { type: "sira", noteId: "c", pinned: false, toIndex: 0 },
      "notlar",
    );
    expect(ids(r.notes)).toEqual(["c", "a", "b"]);
    expect(r.revalidate).toBe(false);
  });

  it("sıra olayı bölüm uyuşmuyorsa yeniden doğrulatır; not yoksa yok sayılır", () => {
    expect(
      applyChannelEvent(grid, { type: "sira", noteId: "a", pinned: true, toIndex: 0 }, "notlar")
        .revalidate,
    ).toBe(true);
    expect(
      applyChannelEvent(grid, { type: "sira", noteId: "x", pinned: false, toIndex: 0 }, "notlar")
        .revalidate,
    ).toBe(false);
  });

  it("görünümden çıkaran olaylar notu kaldırır", () => {
    const cases: [ChannelEventBody, "notlar" | "arsiv" | "cop"][] = [
      [{ type: "arsivlendi", noteId: "a" }, "notlar"],
      [{ type: "arsivden-cikti", noteId: "a" }, "arsiv"],
      [{ type: "cope-atildi", noteId: "a" }, "notlar"],
      [{ type: "cope-atildi", noteId: "a" }, "arsiv"],
      [{ type: "geri-yuklendi", noteId: "a" }, "cop"],
      [{ type: "tasindi", noteId: "a" }, "notlar"],
      [{ type: "silindi", noteIds: ["a", "b"] }, "cop"],
    ];
    for (const [event, view] of cases) {
      const r = applyChannelEvent(grid, event, view);
      expect(
        r.notes.some((n) => n.id === "a"),
        `${event.type} @ ${view}`,
      ).toBe(false);
      expect(r.revalidate).toBe(false);
    }
  });

  it("görünüme giren notlar için yeniden doğrulanır", () => {
    const cases: [ChannelEventBody, "notlar" | "arsiv" | "cop"][] = [
      [{ type: "olusturuldu", noteId: "n" }, "notlar"],
      [{ type: "arsivden-cikti", noteId: "n" }, "notlar"],
      [{ type: "geri-yuklendi", noteId: "n" }, "notlar"],
      [{ type: "arsivlendi", noteId: "n" }, "arsiv"],
      [{ type: "geri-yuklendi", noteId: "n" }, "arsiv"],
      [{ type: "cope-atildi", noteId: "n" }, "cop"],
    ];
    for (const [event, view] of cases) {
      expect(applyChannelEvent(grid, event, view).revalidate, `${event.type} @ ${view}`).toBe(true);
    }
  });

  it("içerik değişikliği yalnızca not görünümdeyse yeniden doğrulatır; başka görünümde oluşturma yok sayılır", () => {
    expect(applyChannelEvent(grid, { type: "icerik", noteId: "a" }, "notlar").revalidate).toBe(
      true,
    );
    expect(applyChannelEvent(grid, { type: "icerik", noteId: "x" }, "notlar").revalidate).toBe(
      false,
    );
    expect(applyChannelEvent(grid, { type: "olusturuldu", noteId: "x" }, "arsiv").revalidate).toBe(
      false,
    );
  });

  it("proje ve üyelik olayları yeniden doğrulatır", () => {
    for (const event of [
      { type: "proje" },
      { type: "uyelik", userId: "u" },
      { type: "proje-silindi" },
    ] as ChannelEventBody[]) {
      expect(applyChannelEvent(grid, event, "notlar").revalidate).toBe(true);
    }
  });

  it("birden çok olay sırayla uygulanır; biri isterse yeniden doğrulanır", () => {
    const r = applyChannelEvents(
      grid,
      [
        { type: "renk", noteId: "b", color: "sari" },
        { type: "arsivlendi", noteId: "a" },
        { type: "olusturuldu", noteId: "yeni" },
      ],
      "notlar",
    );
    expect(r.notes.map((n) => n.id)).toEqual(["b", "c", "p"]);
    expect(r.notes[0]!.color).toBe("sari");
    expect(r.revalidate).toBe(true);
    expect(applyChannelEvents(grid, [], "notlar")).toEqual({ notes: grid, revalidate: false });
  });

  it("olayın notları", () => {
    expect(noteIdsOf({ type: "silindi", noteIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(noteIdsOf({ type: "renk", noteId: "a", color: "mavi" })).toEqual(["a"]);
    expect(noteIdsOf({ type: "proje" })).toEqual([]);
  });
});

describe("kanal olayı doğrulama", () => {
  const base = { by: "u", at: 1 };

  it("geçerli olayları kabul eder", () => {
    for (const e of [
      { type: "olusturuldu", noteId: "n" },
      { type: "icerik", noteId: "n" },
      { type: "renk", noteId: "n", color: "mavi" },
      { type: "sabit", noteId: "n", pinned: false },
      { type: "sira", noteId: "n", pinned: true, toIndex: 2 },
      { type: "arsivlendi", noteId: "n" },
      { type: "silindi", noteIds: ["n"] },
      { type: "uyelik", userId: "u2" },
      { type: "proje" },
      { type: "proje-silindi" },
    ]) {
      expect(parseChannelEvent({ ...e, ...base })).toEqual({ ...e, ...base });
    }
  });

  it("bozuk olayları reddeder", () => {
    for (const e of [
      null,
      [],
      { type: "renk", noteId: "n", color: "mor-olmayan", ...base },
      { type: "sabit", noteId: "n", pinned: "evet", ...base },
      { type: "sira", noteId: "n", pinned: true, toIndex: -1, ...base },
      { type: "sira", noteId: "n", pinned: true, toIndex: 1.5, ...base },
      { type: "icerik", noteId: "", ...base },
      { type: "silindi", noteIds: [1], ...base },
      { type: "uyelik", ...base },
      { type: "bilinmez", ...base },
      { type: "proje", by: "u" },
      { type: 5, ...base },
    ]) {
      expect(parseChannelEvent(e)).toBeNull();
    }
  });
});
