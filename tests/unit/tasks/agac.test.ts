import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "~/domain/tasks/model";
import { MIN_POSITION_GAP } from "~/domain/notes/ordering";
import { applyTaskOps } from "~/domain/tasks/ops";
import {
  appendTask,
  buildTree,
  childCounts,
  doneGroupKey,
  enterKey,
  focusAfterComplete,
  idsWithChildren,
  indent,
  insertAfter,
  insertChild,
  moveAmongSiblings,
  moveTo,
  outdent,
  remove,
  restoreTasks,
  updateTask,
  visibleRows,
  type TreeEdit,
} from "~/domain/tasks/tree";
import { fromSpec, initial, outline } from "./ornek";

const N = "33333333-3333-4333-8333-333333333333";

/** Ağaç işleminin ürettiği işlemler sunucuda aynı sonucu vermeli. */
function replay<E extends TreeEdit>(before: Task[], edit: E): E {
  const server = applyTaskOps(before, edit.ops, { now: 1, userId: "ben" });
  expect(outline(server)).toEqual(outline(edit.tasks));
  return edit;
}

const ids = (rows: ReturnType<typeof visibleRows>) =>
  rows.map((r) =>
    r.kind === "task" ? `${"  ".repeat(r.depth)}${r.id}` : `${"  ".repeat(r.depth)}[${r.count}]`,
  );

describe("görünür satırlar", () => {
  it("ilk açılışta yalnızca üst seviye; tamamlananlar seviyenin sonunda gruplanır", () => {
    const rows = visibleRows(initial(), new Set(), new Set());
    expect(ids(rows)).toEqual(["t1", "t2", "t3", "t6", "[2]"]);
    const header = rows.at(-1)!;
    expect(header).toEqual({
      kind: "done-header",
      key: "root",
      parentId: null,
      depth: 0,
      count: 2,
      open: false,
    });
  });

  it("açılan görevin açık çocukları, ardından kendi 'Tamamlananlar (n)' grubu", () => {
    const rows = visibleRows(initial(), new Set(["t1", "t2", "t23"]), new Set());
    expect(ids(rows)).toEqual([
      "t1",
      "  t12",
      "  t13",
      "  [1]",
      "t2",
      "  t22",
      "  t23",
      "    t231",
      "    t232",
      "  [1]",
      "t3",
      "t6",
      "[2]",
    ]);
  });

  it("grup açıksa tamamlananlar görünür; açık olan tamamlanmış görevin çocukları da", () => {
    const rows = visibleRows(initial(), new Set(["t4"]), new Set(["root", "t4"]));
    expect(ids(rows)).toEqual(["t1", "t2", "t3", "t6", "[2]", "t4", "  [1]", "  t41", "t5"]);
  });

  it("satır alt görev bilgisi taşır: ok, açık mı, '1/3'", () => {
    const row = visibleRows(initial(), new Set(["t1"]), new Set())[0]!;
    expect(row).toMatchObject({
      kind: "task",
      id: "t1",
      depth: 0,
      hasChildren: true,
      expanded: true,
      counts: { done: 1, total: 3, label: "1/3" },
    });
    expect(childCounts(initial(), "t3")).toEqual({ done: 0, total: 0, label: "0/0" });
  });

  it("yerinde bekleyen (1,2 sn) tamamlanmış satır açık listede kalır", () => {
    const tasks = initial().map((t) => (t.id === "t3" ? { ...t, completedAt: 5 } : t));
    expect(ids(visibleRows(tasks, new Set(), new Set()))).toEqual(["t1", "t2", "t6", "[3]"]);
    expect(ids(visibleRows(tasks, new Set(), new Set(), new Set(["t3"])))).toEqual([
      "t1",
      "t2",
      "t3",
      "t6",
      "[2]",
    ]);
  });

  it("grup anahtarı üst görev kimliği ya da 'root'", () => {
    expect([doneGroupKey(null), doneGroupKey("t1")]).toEqual(["root", "t1"]);
  });

  it("iç içe ağaç ve 'Tümünü aç' için alt görevi olanlar", () => {
    const tree = buildTree(initial());
    expect(tree.map((n) => n.id)).toEqual(["t1", "t2", "t3", "t6", "t4", "t5"]);
    expect(tree[1]!.children[2]!.children.map((n) => n.id)).toEqual(["t231", "t232"]);
    expect(idsWithChildren(initial()).sort()).toEqual(["t1", "t2", "t23", "t4"]);
  });
});

describe("Enter: ekle ve böl", () => {
  it("satır sonunda Enter altına aynı seviyede boş görev açar (alt ağacın ardına)", () => {
    const e = replay(initial(), insertAfter(initial(), "t1", N)!);
    expect(outline(e.tasks).slice(0, 6)).toEqual(["t1", "  t11 ✓", "  t12", "  t13", N, "t2"]);
    expect([e.focusId, e.caret, e.createdId]).toEqual([N, 0, N]);
    expect(e.ops).toEqual([{ op: "create", id: N, parentId: null, position: 0.5, title: "" }]);
  });

  it("başlığın ortasında Enter metni böler; kalan metin yeni görevde", () => {
    const e = replay(initial(), insertAfter(initial(), "t1", N, 7)!);
    const t = (id: string) => e.tasks.find((x) => x.id === id)!;
    expect([t("t1").title, t(N).title]).toEqual(["Tasarım", " onayı"]);
    expect(e.ops[0]).toEqual({ op: "update", id: "t1", title: "Tasarım" });
  });

  it("imleç baştayken üste boş satır eklenir; metin ve tarih yerinde kalır", () => {
    const e = replay(initial(), insertAfter(initial(), "t3", N, 0)!);
    expect(outline(e.tasks).slice(10, 13)).toEqual([N, "t3", "t6"]);
    expect([e.focusId, e.caret]).toEqual(["t3", 0]);
    expect(e.tasks.find((x) => x.id === "t3")!.dueDate).toBe("2026-11-04");
  });

  it("alt görevde Enter kardeş açar", () => {
    const e = replay(initial(), insertAfter(initial(), "t12", N)!);
    expect(outline(e.tasks).slice(0, 5)).toEqual(["t1", "  t11 ✓", "  t12", `  ${N}`, "  t13"]);
  });

  it("boş alt görevde Enter girintiyi azaltır; boş üst seviyede yeni satır açar", () => {
    let tasks = insertChild(initial(), "t1", N)!.tasks;
    const e = enterKey(tasks, N, "44444444-4444-4444-8444-444444444444", 0)!;
    expect(e.tasks.find((t) => t.id === N)!.parentId).toBeNull();
    expect([e.focusId, e.caret]).toEqual([N, 0]);
    tasks = e.tasks;
    const e2 = enterKey(tasks, N, "44444444-4444-4444-8444-444444444444")!;
    expect(e2.focusId).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("bilinmeyen görevde null", () => {
    expect(insertAfter(initial(), "yok", N)).toBeNull();
    expect(enterKey(initial(), "yok", N)).toBeNull();
    expect(insertChild(initial(), "yok", N)).toBeNull();
  });

  it("alt görev ekle: son çocuk olur, üst açılır; 'Görev ekle' en sona ekler", () => {
    const e = replay(initial(), insertChild(initial(), "t1", N, "Yeni")!);
    expect(outline(e.tasks).slice(0, 5)).toEqual(["t1", "  t11 ✓", "  t12", "  t13", `  ${N}`]);
    expect(e.expand).toBe("t1");
    const a = replay(initial(), appendTask(initial(), N));
    expect(outline(a.tasks).at(-1)).toBe(N);
    expect(a.focusId).toBe(N);
  });

  it("komşular arasında yer kalmayınca kardeşler yeniden numaralanır", () => {
    const tight = [
      makeTask("a", null, 0),
      makeTask("b", null, MIN_POSITION_GAP / 2),
      makeTask("c", null, 1),
    ];
    const e = replay(tight, insertAfter(tight, "a", N)!);
    expect(outline(e.tasks)).toEqual(["a", N, "b", "c"]);
    expect(e.ops.filter((o) => o.op === "move").length).toBeGreaterThan(0);
    expect(e.tasks.map((t) => t.position).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("girinti", () => {
  it("bir önceki açık kardeşin son çocuğu olur (alt ağacıyla), üst açılır", () => {
    const e = replay(initial(), indent(initial(), "t3")!);
    expect(outline(e.tasks).slice(4, 11)).toEqual([
      "t2",
      "  t21 ✓",
      "  t22",
      "  t23",
      "    t231",
      "    t232",
      "  t3",
    ]);
    expect(e.expand).toBe("t2");
    expect(e.ops).toEqual([{ op: "move", id: "t3", parentId: "t2", position: 3 }]);
  });

  it("aradaki tamamlanmış kardeş atlanır", () => {
    const tasks = fromSpec([{ id: "a" }, { id: "d", done: true }, { id: "b" }]);
    expect(outline(indent(tasks, "b")!.tasks)).toEqual(["a", "  b", "d ✓"]);
  });

  it("ilk açık kardeş ve tamamlanmış görev girintilenmez", () => {
    expect(indent(initial(), "t1")).toBeNull();
    expect(indent(initial(), "t12")).toBeNull();
    expect(indent(initial(), "t5")).toBeNull();
    expect(indent(initial(), "yok")).toBeNull();
  });

  it("girintiyi azalt: üstün hemen ardına, kendi alt ağacıyla; sonraki kardeşler üstte kalır", () => {
    let e = replay(initial(), outdent(initial(), "t12")!);
    expect(outline(e.tasks).slice(0, 5)).toEqual(["t1", "  t11 ✓", "  t13", "t12", "t2"]);
    e = replay(initial(), outdent(initial(), "t23")!);
    expect(outline(e.tasks).slice(4, 10)).toEqual([
      "t2",
      "  t21 ✓",
      "  t22",
      "t23",
      "  t231",
      "  t232",
    ]);
  });

  it("üst seviyede girinti azaltılamaz", () => {
    expect(outdent(initial(), "t1")).toBeNull();
    expect(outdent(initial(), "yok")).toBeNull();
  });

  it("girinti ve geri alma ön sırayı korur (Tab, Shift+Tab)", () => {
    const start = initial();
    const back = outdent(indent(start, "t3")!.tasks, "t3")!.tasks;
    expect(outline(back)).toEqual(outline(start));
    const deep = indent(indent(start, "t232")!.tasks, "t232");
    expect(deep).toBeNull();
    const twice = outdent(outdent(start, "t231")!.tasks, "t231")!.tasks;
    expect(outline(twice).slice(4, 10)).toEqual([
      "t2",
      "  t21 ✓",
      "  t22",
      "  t23",
      "    t232",
      "t231",
    ]);
  });
});

describe("kardeşler arasında taşıma (Alt+↑ / Alt+↓)", () => {
  it("yukarı ve aşağı; alt ağaç birlikte gider", () => {
    let e = replay(initial(), moveAmongSiblings(initial(), "t3", -1)!);
    expect(outline(e.tasks).filter((l) => !l.startsWith(" "))).toEqual([
      "t1",
      "t3",
      "t2",
      "t6",
      "t4 ✓",
      "t5 ✓",
    ]);
    e = replay(initial(), moveAmongSiblings(initial(), "t2", 1)!);
    expect(outline(e.tasks).slice(4, 6)).toEqual(["t3", "t2"]);
  });

  it("yalnızca aynı tamamlanma durumundaki kardeşler arasında", () => {
    expect(moveAmongSiblings(initial(), "t6", 1)).toBeNull();
    expect(moveAmongSiblings(initial(), "t1", -1)).toBeNull();
    const e = replay(initial(), moveAmongSiblings(initial(), "t5", -1)!);
    expect(outline(e.tasks).slice(-3)).toEqual(["t5 ✓", "t4 ✓", "  t41 ✓"]);
    expect(
      moveAmongSiblings(initial(), "t13", -1)!.tasks.find((t) => t.id === "t13")!.position,
    ).toBe(0.5);
    expect(moveAmongSiblings(initial(), "yok", 1)).toBeNull();
  });
});

describe("sürükle-bırak (moveTo)", () => {
  it("başka görevin altına, açık kardeşler arasındaki sıraya bırakılır", () => {
    const e = replay(initial(), moveTo(initial(), "t3", "t23", 1)!);
    expect(outline(e.tasks).slice(7, 11)).toEqual(["  t23", "    t231", "    t3", "    t232"]);
  });

  it("üst seviyeye ve en başa", () => {
    const e = replay(initial(), moveTo(initial(), "t232", null, 0)!);
    expect(outline(e.tasks)[0]).toBe("t232");
  });

  it("sıra açık kardeşlere göredir: sona bırakılan açık görev tamamlananların önüne geçmez", () => {
    const e = replay(initial(), moveTo(initial(), "t3", "t1", 99)!);
    const kids = e.tasks.filter((t) => t.parentId === "t1").sort((a, b) => a.position - b.position);
    expect(kids.map((t) => t.id)).toEqual(["t11", "t12", "t13", "t3"]);
    const into = replay(initial(), moveTo(initial(), "t13", "t4", 0)!);
    expect(into.tasks.find((t) => t.id === "t4")!.completedAt).toBeNull();
  });

  it("tamamlanmış görev kendi grubunda sıralanır", () => {
    const e = moveTo(initial(), "t5", null, 0)!;
    expect(
      outline(e.tasks)
        .filter((l) => !l.startsWith(" "))
        .slice(-2),
    ).toEqual(["t5 ✓", "t4 ✓"]);
    const tasks = fromSpec([
      { id: "a", kids: [{ id: "b" }] },
      { id: "z", done: true },
    ]);
    expect(outline(moveTo(tasks, "z", "a", 0)!.tasks)).toEqual(["a", "  b", "  z ✓"]);
  });

  it("kendi alt ağacına bırakma ve yer değiştirmeyen bırakma reddedilir", () => {
    expect(moveTo(initial(), "t2", "t231", 0)).toBeNull();
    expect(moveTo(initial(), "t2", "t2", 0)).toBeNull();
    expect(moveTo(initial(), "t2", "yok", 0)).toBeNull();
    expect(moveTo(initial(), "yok", null, 0)).toBeNull();
    expect(moveTo(initial(), "t2", null, 1)).toBeNull();
  });
});

describe("silme", () => {
  it("boş satır silinir; silinen görev geri yüklenebilir", () => {
    const e = replay(initial(), remove(initial(), "t3")!);
    expect(e.tasks.some((t) => t.id === "t3")).toBe(false);
    expect(e.removed.map((t) => t.id)).toEqual(["t3"]);
    const back = restoreTasks(e.tasks, e.removed);
    expect(outline(back.tasks)).toEqual(outline(initial()));
    expect(back.ops).toEqual([
      {
        op: "create",
        id: "t3",
        parentId: null,
        position: 2,
        title: "SEO kontrolleri",
        description: "",
        startDate: null,
        dueDate: "2026-11-04",
        dueTime: null,
        completed: false,
      },
    ]);
  });

  it("alt görevi olan görev reddedilir; alt ağaçla silme seçilebilir", () => {
    expect(remove(initial(), "t23")).toBeNull();
    const e = replay(initial(), remove(initial(), "t23", { withSubtree: true })!);
    expect(e.removed.map((t) => t.id)).toEqual(["t23", "t231", "t232"]);
    expect(e.ops).toEqual([{ op: "delete", id: "t23", withSubtree: true }]);
    expect(remove(initial(), "yok")).toBeNull();
  });
});

describe("alan güncelleme ve odak", () => {
  it("güncelleme işlemi üretir; tarih kuralı uygulanır", () => {
    const e = replay(initial(), updateTask(initial(), "t6", { startDate: "2026-11-25" })!);
    expect(e.tasks.find((t) => t.id === "t6")!.startDate).toBe("2026-11-20");
    expect(e.ops).toEqual([{ op: "update", id: "t6", startDate: "2026-11-25" }]);
    expect(updateTask(initial(), "yok", { title: "x" })).toBeNull();
  });

  it("Ctrl+Enter sonrası odak: sonraki görünür satır, zincirle inenler atlanır; yoksa önceki", () => {
    const tasks = initial();
    const visible = ["t1", "t12", "t13", "t2", "t3", "t6"];
    expect(focusAfterComplete(tasks, visible, "t13", ["t13", "t1"])).toBe("t2");
    expect(focusAfterComplete(tasks, visible, "t6", ["t6"])).toBe("t3");
    expect(focusAfterComplete(tasks, visible, "t1", ["t1", "t12", "t13"])).toBe("t2");
    expect(focusAfterComplete(tasks, ["t3"], "t3", ["t3"])).toBeNull();
  });
});
