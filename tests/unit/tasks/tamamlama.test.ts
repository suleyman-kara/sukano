import { describe, expect, it } from "vitest";
import {
  applyCompletionPatch,
  clearCompleted,
  completeTask,
  reopenTasks,
  toggleComplete,
  uncompleteTask,
} from "~/domain/tasks/completion";
import { DONE_AT, done, fromSpec, initial, outline } from "./ornek";

const NOW = 5_000;

describe("tamamlama", () => {
  it("tek görev tamamlanır; tamamlayan ve an kaydedilir", () => {
    const r = toggleComplete(initial(), "t12", NOW, "ayse")!;
    expect(r.completed).toBe(true);
    expect(r.changed).toEqual(["t12"]);
    expect(r.chain).toEqual({});
    const t = r.tasks.find((x) => x.id === "t12")!;
    expect([t.completedAt, t.completedBy]).toEqual([NOW, "ayse"]);
    expect(r.ops).toEqual([{ op: "complete", id: "t12" }]);
  });

  it("üst görev işaretlenince tüm alt ağacı tamamlanır (zaten tamamlananlar değişmez)", () => {
    const r = toggleComplete(initial(), "t2", NOW, "ben")!;
    expect(r.changed).toEqual(["t2", "t22", "t23", "t231", "t232"]);
    expect(r.tasks.find((x) => x.id === "t21")!.completedAt).toBe(DONE_AT);
    for (const id of r.changed) expect(done(r.tasks, id)).toBe(true);
  });

  it("alt görevlerin hepsi tamamlanınca üst görev kendiliğinden tamamlanır", () => {
    let tasks = toggleComplete(initial(), "t12", NOW, "ben")!.tasks;
    const r = toggleComplete(tasks, "t13", NOW, "ben")!;
    expect(r.changed).toEqual(["t13", "t1"]);
    expect(r.chain).toEqual({ parentId: "t1", parentTitle: "Tasarım onayı" });
    tasks = r.tasks;
    expect(done(tasks, "t1")).toBe(true);
  });

  it("zincirleme yukarı doğru sürer; zincir metni en üstteki görevi söyler", () => {
    const tasks = fromSpec([
      {
        id: "a",
        title: "Lansman",
        kids: [
          { id: "b", title: "Hazırlık", kids: [{ id: "c", title: "Son adım" }] },
          { id: "d", done: true },
        ],
      },
    ]);
    const r = toggleComplete(tasks, "c", NOW, "ben")!;
    expect(r.changed).toEqual(["c", "b", "a"]);
    expect(r.chain).toEqual({ parentId: "a", parentTitle: "Lansman" });
  });

  it("açık kardeş varsa zincir durur", () => {
    const r = toggleComplete(initial(), "t13", NOW, "ben")!;
    expect(r.changed).toEqual(["t13"]);
    expect(done(r.tasks, "t1")).toBe(false);
  });

  it("geri açınca alt ağaç ve yukarı doğru tüm tamamlanmış üstler açılır", () => {
    const tasks = fromSpec([
      {
        id: "a",
        done: true,
        kids: [
          { id: "b", done: true, kids: [{ id: "c", done: true }] },
          { id: "d", done: true },
        ],
      },
    ]);
    const r = toggleComplete(tasks, "b", NOW, "ben")!;
    expect(r.completed).toBe(false);
    expect(r.changed).toEqual(["b", "c", "a"]);
    expect(done(r.tasks, "d")).toBe(true);
    expect(r.ops).toEqual([{ op: "uncomplete", id: "b" }]);
    expect(r.tasks.find((x) => x.id === "a")!.completedBy).toBeNull();
  });

  it("yama ve tersi: tersini uygulamak önceki hali birebir verir", () => {
    const before = initial();
    const tasks = toggleComplete(before, "t12", NOW, "ben")!.tasks;
    const r = toggleComplete(tasks, "t13", NOW, "ben")!;
    expect(r.patch).toEqual([
      { id: "t13", completedAt: NOW, completedBy: "ben" },
      { id: "t1", completedAt: NOW, completedBy: "ben" },
    ]);
    expect(r.inverse).toEqual([
      { id: "t13", completedAt: null, completedBy: null },
      { id: "t1", completedAt: null, completedBy: null },
    ]);
    expect(applyCompletionPatch(r.tasks, r.inverse)).toEqual(tasks);
    expect(applyCompletionPatch(tasks, r.patch)).toEqual(r.tasks);
  });

  it("girdi listesi değiştirilmez; bilinmeyen görev null döner", () => {
    const before = initial();
    const copy = structuredClone(before);
    toggleComplete(before, "t2", NOW, "ben");
    expect(before).toEqual(copy);
    expect(toggleComplete(before, "yok", NOW, "ben")).toBeNull();
  });

  it("completeTask / uncompleteTask zaten o durumdaysa değişiklik üretmez", () => {
    expect(completeTask(initial(), "t5", NOW, "ben").changed).toEqual([]);
    expect(uncompleteTask(initial(), "t3").changed).toEqual([]);
    expect(completeTask(initial(), "yok", NOW, "ben").changed).toEqual([]);
  });
});

describe("geri alma (yeniden açma)", () => {
  it("tam olarak verilen görevleri açar; açık kalmış alt görevlere dokunmaz", () => {
    let tasks = toggleComplete(initial(), "t12", NOW, "ben")!.tasks;
    const r = toggleComplete(tasks, "t13", NOW, "ben")!;
    tasks = reopenTasks(r.tasks, r.changed).tasks;
    expect(done(tasks, "t13")).toBe(false);
    expect(done(tasks, "t1")).toBe(false);
    expect(done(tasks, "t12")).toBe(true);
  });

  it("açılan görevin tamamlanmış üstleri de açılır (tutarlılık)", () => {
    const tasks = fromSpec([{ id: "a", done: true, kids: [{ id: "b", done: true }] }]);
    const r = reopenTasks(tasks, ["b"]);
    expect(r.changed).toEqual(["b", "a"]);
    expect(r.ops).toEqual([{ op: "reopen", ids: ["b"] }]);
  });

  it("bilinmeyen ya da zaten açık kimlikler yok sayılır", () => {
    expect(reopenTasks(initial(), ["yok", "t3"]).changed).toEqual([]);
  });
});

describe("tamamlananları sil", () => {
  it("tamamlanan görevler alt ağaçlarıyla silinir, açıklar kalır", () => {
    const r = clearCompleted(initial());
    expect(outline(r.tasks)).toEqual([
      "t1",
      "  t12",
      "  t13",
      "t2",
      "  t22",
      "  t23",
      "    t231",
      "    t232",
      "t3",
      "t6",
    ]);
    expect(r.removed.map((t) => t.id).sort()).toEqual(["t11", "t21", "t4", "t41", "t5"]);
    expect(r.ops).toEqual([{ op: "clearCompleted" }]);
  });

  it("silinen görevler geri yükleme için üstten alta sıralıdır", () => {
    const r = clearCompleted(initial());
    const ids = r.removed.map((t) => t.id);
    expect(ids.indexOf("t4")).toBeLessThan(ids.indexOf("t41"));
  });
});
