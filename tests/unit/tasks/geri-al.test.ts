import { describe, expect, it } from "vitest";
import {
  TOAST_MAX,
  TOAST_MIN_LEFT,
  TOAST_MS,
  UNDO_MAX,
  clearOnTyping,
  completionToastText,
  daDe,
  dismissToast,
  emptyUndo,
  forgetIds,
  pausedLeft,
  pushCompletion,
  resumeDelay,
  applyUndo,
  toggleWithUndo,
  undoLast,
  undoToast,
  type UndoState,
} from "~/domain/tasks/undo";
import { done, initial } from "./ornek";

const texts = (s: UndoState) => s.toasts.map((t) => t.text);

describe("toast metni", () => {
  it("görev adını söyler; zincirde üst görev adı ve -da/-de", () => {
    expect(completionToastText("Mobil görünüm")).toBe("Mobil görünüm tamamlandı");
    expect(completionToastText("Mobil görünüm", "Tasarım onayı")).toBe(
      "Tasarım onayı da tamamlandı",
    );
    expect(completionToastText("x", "SEO kontrolleri")).toBe("SEO kontrolleri de tamamlandı");
    expect(completionToastText("   ")).toBe("Adsız görev tamamlandı");
    expect(completionToastText("x", " ")).toBe("Adsız görev de tamamlandı");
  });

  it.each([
    ["Tasarım onayı", "da"],
    ["SEO kontrolleri", "de"],
    ["Mobil görünüm", "de"],
    ["Kargo", "da"],
    ["Ürün", "de"],
    ["SSS", "de"],
    ["IŞIK", "da"],
    ["Okul", "da"],
  ])("%s → %s", (word, suffix) => {
    expect(daDe(word)).toBe(suffix);
  });
});

describe("toast yığını ve Ctrl+Z", () => {
  it("tek tamamlama: toast ve geri al kaydı", () => {
    const r = pushCompletion(emptyUndo(), "Ürün sayfası tamamlandı", ["t12"]);
    expect(texts(r.state)).toEqual(["Ürün sayfası tamamlandı"]);
    expect(r.state.stack).toEqual([{ key: r.key, ids: ["t12"] }]);
    expect(r.dropped).toEqual([]);
  });

  it("yeni toast üstte; önceki ikinci satırda korunur", () => {
    let s = pushCompletion(emptyUndo(), "Ürün sayfası tamamlandı", ["t12"]).state;
    s = pushCompletion(s, "Tasarım onayı da tamamlandı", ["t13", "t1"]).state;
    expect(texts(s)).toEqual(["Tasarım onayı da tamamlandı", "Ürün sayfası tamamlandı"]);
  });

  it("toast'taki Geri al zinciri açar; diğer toast ve kayıt kalır", () => {
    let s = pushCompletion(emptyUndo(), "Ürün sayfası tamamlandı", ["t12"]).state;
    const chain = pushCompletion(s, "Tasarım onayı da tamamlandı", ["t13", "t1"]);
    const r = undoToast(chain.state, chain.key)!;
    expect(r.ids).toEqual(["t13", "t1"]);
    s = r.state;
    expect(texts(s)).toEqual(["Ürün sayfası tamamlandı"]);
    expect(s.stack.map((u) => u.ids)).toEqual([["t12"]]);
    expect(undoToast(s, "yok")).toBeNull();
  });

  it(`en çok ${TOAST_MAX} toast; düşen toast'un işi Ctrl+Z yığınında kalır`, () => {
    let s = emptyUndo();
    const first = pushCompletion(s, "SEO kontrolleri tamamlandı", ["t3"]);
    s = pushCompletion(first.state, "Lansman duyurusu tamamlandı", ["t6"]).state;
    const third = pushCompletion(s, "Ürün sayfası tamamlandı", ["t12"]);
    expect(third.dropped).toEqual([first.key]);
    s = third.state;
    expect(texts(s)).toEqual(["Ürün sayfası tamamlandı", "Lansman duyurusu tamamlandı"]);

    let u = undoLast(s)!;
    expect(u.ids).toEqual(["t12"]);
    u = undoLast(u.state)!;
    expect(u.ids).toEqual(["t6"]);
    u = undoLast(u.state)!;
    expect(u.ids).toEqual(["t3"]);
    expect(u.state.toasts).toEqual([]);
    expect(undoLast(u.state)).toBeNull();
  });

  it("başlık yazılınca Ctrl+Z metne kalır: yığın boşalır, toast durur", () => {
    const s = clearOnTyping(
      pushCompletion(emptyUndo(), "SEO kontrolleri tamamlandı", ["t3"]).state,
    );
    expect(undoLast(s)).toBeNull();
    expect(texts(s)).toEqual(["SEO kontrolleri tamamlandı"]);
    expect(undoToast(s, s.toasts[0]!.key)!.ids).toEqual(["t3"]);
  });

  it("süresi dolan toast kalkar ama Ctrl+Z ile geri alınabilir", () => {
    const r = pushCompletion(emptyUndo(), "SEO kontrolleri tamamlandı", ["t3"]);
    const s = dismissToast(r.state, r.key);
    expect(s.toasts).toEqual([]);
    expect(undoLast(s)!.ids).toEqual(["t3"]);
  });

  it("görev elle geri açılınca ilgili toast ve kayıtlar kalkar", () => {
    let s = pushCompletion(emptyUndo(), "A tamamlandı", ["a"]).state;
    s = pushCompletion(s, "B de tamamlandı", ["b", "p"]).state;
    s = forgetIds(s, ["p"]);
    expect(texts(s)).toEqual(["A tamamlandı"]);
    expect(s.stack.map((u) => u.ids)).toEqual([["a"]]);
  });

  it(`yığın en çok ${UNDO_MAX} kayıt tutar`, () => {
    let s = emptyUndo();
    for (let i = 0; i < UNDO_MAX + 5; i++) s = pushCompletion(s, `${i}`, [`g${i}`]).state;
    expect(s.stack).toHaveLength(UNDO_MAX);
    expect(s.stack[0]!.ids).toEqual(["g5"]);
  });

  it("girdi durumu değiştirilmez", () => {
    const s = emptyUndo();
    pushCompletion(s, "x", ["a"]);
    expect(s).toEqual(emptyUndo());
  });
});

describe("toast süresi", () => {
  it(`${TOAST_MS / 1000} sn; üzerine gelince kalan süre saklanır, devamda en az ${TOAST_MIN_LEFT / 1000} sn`, () => {
    expect(pausedLeft(TOAST_MS, 1_000, 3_000)).toBe(4_000);
    expect(pausedLeft(1_000, 0, 5_000)).toBe(0);
    expect(resumeDelay(6_000)).toBe(6_000);
    expect(resumeDelay(500)).toBe(TOAST_MIN_LEFT);
    expect(resumeDelay(undefined)).toBe(TOAST_MS);
  });
});

describe("tamamla + toast birlikte", () => {
  it("tamamlama toast açar; zincirde üst görev adı yazar; geri al zinciri açar", () => {
    let tasks = initial();
    let undo = emptyUndo();
    const a = toggleWithUndo(tasks, undo, "t12", 1, "ben")!;
    tasks = a.result.tasks;
    undo = a.undo;
    const b = toggleWithUndo(tasks, undo, "t13", 2, "ben")!;
    tasks = b.result.tasks;
    undo = b.undo;
    expect(texts(undo)).toEqual(["Tasarım onayı da tamamlandı", "Ürün sayfası tamamlandı"]);
    expect(b.toastKey).toBe("k2");
    const u = undoToast(undo, b.toastKey!)!;
    const reopened = applyUndo(tasks, u.ids);
    expect([
      done(reopened.tasks, "t13"),
      done(reopened.tasks, "t1"),
      done(reopened.tasks, "t12"),
    ]).toEqual([false, false, true]);
    expect(reopened.ops).toEqual([{ op: "reopen", ids: ["t13", "t1"] }]);
  });

  it("geri açma anında olur, toast kapanır", () => {
    const a = toggleWithUndo(initial(), emptyUndo(), "t6", 1, "ben")!;
    const b = toggleWithUndo(a.result.tasks, a.undo, "t6", 2, "ben")!;
    expect([b.result.completed, b.toastKey, b.undo.toasts.length]).toEqual([false, null, 0]);
    expect(toggleWithUndo(initial(), emptyUndo(), "yok", 1, "ben")).toBeNull();
  });
});
