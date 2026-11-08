import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  depthOf,
  hasChildren,
  isDescendant,
  makeTask,
  subtreeIds,
  treeOrder,
} from "~/domain/tasks/model";
import { initial } from "./ornek";

describe("görev modeli yardımcıları", () => {
  it("üstler yakından uzağa; derinlik ve alt ağaç", () => {
    expect(ancestorsOf(initial(), "t231").map((t) => t.id)).toEqual(["t23", "t2"]);
    expect(depthOf(initial(), "t231")).toBe(2);
    expect(subtreeIds(initial(), "t2")).toEqual(["t2", "t21", "t22", "t23", "t231", "t232"]);
    expect(subtreeIds(initial(), "yok")).toEqual([]);
    expect(isDescendant(initial(), "t231", "t2")).toBe(true);
    expect(isDescendant(initial(), "t2", "t231")).toBe(false);
    expect([hasChildren(initial(), "t1"), hasChildren(initial(), "t3")]).toEqual([true, false]);
  });

  it("bozuk veride (döngü, olmayan üst) sonsuz döngüye girmez", () => {
    const loop = [makeTask("a", "b", 0), makeTask("b", "a", 0)];
    expect(ancestorsOf(loop, "a").map((t) => t.id)).toEqual(["b"]);
    const orphan = [makeTask("a", "yok", 0)];
    expect(ancestorsOf(orphan, "a")).toEqual([]);
    expect(treeOrder(orphan)).toEqual([]);
  });

  it("eşit konumda kimlik sırası belirleyicidir", () => {
    const tasks = [makeTask("b", null, 0), makeTask("a", null, 0), makeTask("c", null, 0)];
    expect(treeOrder(tasks).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
