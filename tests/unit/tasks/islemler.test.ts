import { describe, expect, it } from "vitest";
import { makeTask } from "~/domain/tasks/model";
import {
  MAX_OPS,
  MAX_TASKS,
  TaskOpError,
  applyTaskOps,
  diffTasks,
  parseTaskOps,
  type TaskOp,
} from "~/domain/tasks/ops";
import { done, fromSpec, initial, outline } from "./ornek";

const CTX = { now: 9_000, userId: "ben" };
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const apply = (ops: TaskOp[], tasks = initial()) => applyTaskOps(tasks, ops, CTX);

describe("işlem doğrulama (parseTaskOps)", () => {
  it("geçerli işlem listesi aynen döner; eksik isteğe bağlı alanlar eklenmez", () => {
    const ops = [
      { op: "create", id: U1, parentId: null, position: 1.5, title: "Yeni" },
      { op: "update", id: "t1", title: "Başlık", dueDate: "2026-11-20", dueTime: null },
      { op: "move", id: "t3", parentId: "t1", position: 7 },
      { op: "complete", id: "t3" },
      { op: "uncomplete", id: "t3" },
      { op: "reopen", ids: ["t3", "lansman-hazirligi-g2-1"] },
      { op: "delete", id: "t3", withSubtree: true },
      { op: "clearCompleted" },
    ];
    expect(parseTaskOps({ ops })).toEqual({ ok: true, value: ops });
  });

  it.each([
    [null, "Geçersiz istek"],
    [{ ops: "x" }, "Geçersiz istek"],
    [{ ops: [] }, "İşlem yok"],
    [
      { ops: Array.from({ length: MAX_OPS + 1 }, () => ({ op: "clearCompleted" })) },
      "Çok fazla işlem",
    ],
    [{ ops: [{ op: "uçur", id: "t1" }] }, "Bilinmeyen işlem"],
    [{ ops: [null] }, "Bilinmeyen işlem"],
    [{ ops: [{ op: "complete", id: "a b" }] }, "Geçersiz görev kimliği"],
    [{ ops: [{ op: "create", id: "t9", parentId: null, position: 0 }] }, "Geçersiz görev kimliği"],
    [{ ops: [{ op: "create", id: U1, parentId: "a b", position: 0 }] }, "Geçersiz üst görev"],
    [{ ops: [{ op: "create", id: U1, parentId: null, position: Infinity }] }, "Geçersiz sıra"],
    [{ ops: [{ op: "move", id: "t1", parentId: null, position: "1" }] }, "Geçersiz sıra"],
    [{ ops: [{ op: "move", id: "t1", position: 1 }] }, "Geçersiz üst görev"],
    [{ ops: [{ op: "update", id: "t1", title: "x".repeat(1001) }] }, "Başlık çok uzun"],
    [{ ops: [{ op: "update", id: "t1", description: 5 }] }, "Açıklama geçersiz"],
    [{ ops: [{ op: "update", id: "t1", dueDate: "2026-02-30" }] }, "Geçersiz tarih"],
    [{ ops: [{ op: "update", id: "t1", startDate: "dün" }] }, "Geçersiz tarih"],
    [{ ops: [{ op: "update", id: "t1", dueTime: "25:00" }] }, "Geçersiz saat"],
    [{ ops: [{ op: "update", id: "t1" }] }, "Değişiklik yok"],
    [{ ops: [{ op: "reopen", ids: [] }] }, "Geçersiz görev kimliği"],
    [{ ops: [{ op: "reopen", ids: "t1" }] }, "Geçersiz görev kimliği"],
    [{ ops: [{ op: "delete", id: "t1", withSubtree: "evet" }] }, "Geçersiz silme"],
    [
      { ops: [{ op: "create", id: U1, parentId: null, position: 0, completed: 1 }] },
      "Geçersiz tamamlanma",
    ],
  ])("%j → %s", (input, error) => {
    expect(parseTaskOps(input)).toEqual({ ok: false, error });
  });
});

describe("işlem uygulama (applyTaskOps)", () => {
  it("oluştur: verilen üst ve sırayla eklenir; oluşturan alanlar boş başlar", () => {
    const tasks = apply([
      { op: "create", id: U1, parentId: "t2", position: 0.5, title: "Ara görev" },
    ]);
    expect(outline(tasks).slice(4, 8)).toEqual(["t2", "  t21 ✓", `  ${U1}`, "  t22"]);
    expect(tasks.find((t) => t.id === U1)).toEqual(makeTask(U1, "t2", 0.5, { title: "Ara görev" }));
  });

  it("oluştur: tamamlanmış olarak (geri yükleme) eklenebilir", () => {
    const tasks = apply([{ op: "create", id: U1, parentId: null, position: 9, completed: true }]);
    expect(tasks.find((t) => t.id === U1)).toMatchObject({
      completedAt: 9_000,
      completedBy: "ben",
    });
  });

  it("oluştur: tamamlanmış üstün altına açık görev eklenince üstler açılır", () => {
    const tasks = apply([{ op: "create", id: U1, parentId: "t41", position: 0 }]);
    expect(done(tasks, "t41")).toBe(false);
    expect(done(tasks, "t4")).toBe(false);
  });

  it("oluştur: var olan kimlik ya da olmayan üst reddedilir", () => {
    expect(() =>
      apply([
        { op: "create", id: U1, parentId: null, position: 0 },
        { op: "create", id: U1, parentId: null, position: 1 },
      ]),
    ).toThrow(new TaskOpError("Görev zaten var"));
    expect(() => apply([{ op: "create", id: U1, parentId: "yok", position: 0 }])).toThrow(
      "Üst görev bulunamadı",
    );
  });

  it("aynı istekte önce oluşturulan görevin altına eklenebilir", () => {
    const tasks = apply([
      { op: "create", id: U1, parentId: null, position: 10 },
      { op: "create", id: U2, parentId: U1, position: 0 },
    ]);
    expect(outline(tasks).slice(-2)).toEqual([U1, `  ${U2}`]);
  });

  it("güncelle: alanlar değişir; başlangıç > bitiş düzeltilir; bitiş silinince saat de silinir", () => {
    let tasks = apply([
      { op: "update", id: "t3", title: "SEO", description: "<p>a</p>", startDate: "2026-11-10" },
    ]);
    expect(tasks.find((t) => t.id === "t3")).toMatchObject({
      title: "SEO",
      description: "<p>a</p>",
      startDate: "2026-11-04",
      dueDate: "2026-11-04",
    });
    tasks = apply([{ op: "update", id: "t2", dueDate: null }]);
    expect(tasks.find((t) => t.id === "t2")).toMatchObject({
      startDate: "2026-11-03",
      dueDate: null,
      dueTime: null,
    });
  });

  it("güncelle: olmayan görev reddedilir", () => {
    expect(() => apply([{ op: "update", id: "yok", title: "x" }])).toThrow("Görev bulunamadı");
  });

  it("taşı: yeni üst ve sıra uygulanır, alt ağaç birlikte gelir", () => {
    const tasks = apply([{ op: "move", id: "t23", parentId: null, position: 1.5 }]);
    expect(outline(tasks).slice(7, 11)).toEqual(["t23", "  t231", "  t232", "t3"]);
  });

  it("taşı: kendi altına ya da alt ağacına taşıma reddedilir", () => {
    expect(() => apply([{ op: "move", id: "t2", parentId: "t231", position: 0 }])).toThrow(
      "Görev kendi alt ağacına taşınamaz",
    );
    expect(() => apply([{ op: "move", id: "t2", parentId: "t2", position: 0 }])).toThrow(
      "Görev kendi alt ağacına taşınamaz",
    );
    expect(() => apply([{ op: "move", id: "t2", parentId: "yok", position: 0 }])).toThrow(
      "Üst görev bulunamadı",
    );
    expect(() => apply([{ op: "move", id: "yok", parentId: null, position: 0 }])).toThrow(
      "Görev bulunamadı",
    );
  });

  it("taşı: açık görev tamamlanmış üstün altına bırakılınca üst açılır", () => {
    const tasks = apply([{ op: "move", id: "t3", parentId: "t4", position: 5 }]);
    expect(done(tasks, "t4")).toBe(false);
  });

  it("tamamla: zincir sunucuda hesaplanır (yalnızca son alt görev gönderilse de üst tamamlanır)", () => {
    const tasks = apply([
      { op: "complete", id: "t12" },
      { op: "complete", id: "t13" },
    ]);
    expect(done(tasks, "t1")).toBe(true);
    expect(tasks.find((t) => t.id === "t1")).toMatchObject({
      completedAt: 9_000,
      completedBy: "ben",
    });
  });

  it("geri aç ve yeniden aç işlemleri", () => {
    let tasks = apply([{ op: "uncomplete", id: "t41" }]);
    expect([done(tasks, "t41"), done(tasks, "t4")]).toEqual([false, false]);
    tasks = apply([{ op: "reopen", ids: ["t41", "yok"] }]);
    expect([done(tasks, "t41"), done(tasks, "t4")]).toEqual([false, false]);
    expect(() => apply([{ op: "complete", id: "yok" }])).toThrow("Görev bulunamadı");
    expect(() => apply([{ op: "uncomplete", id: "yok" }])).toThrow("Görev bulunamadı");
  });

  it("sil: alt görevi olan görev reddedilir; alt ağaçla silme seçeneği", () => {
    expect(() => apply([{ op: "delete", id: "t23" }])).toThrow("Alt görevi olan görev silinemez");
    const tasks = apply([{ op: "delete", id: "t23", withSubtree: true }]);
    expect(tasks.some((t) => ["t23", "t231", "t232"].includes(t.id))).toBe(false);
    expect(apply([{ op: "delete", id: "t3" }]).some((t) => t.id === "t3")).toBe(false);
    expect(() => apply([{ op: "delete", id: "yok" }])).toThrow("Görev bulunamadı");
  });

  it("tamamlananları sil", () => {
    const tasks = apply([{ op: "clearCompleted" }]);
    expect(tasks.some((t) => t.completedAt !== null)).toBe(false);
  });

  it("bir işlem hatalıysa girdi liste değişmez (hiçbiri uygulanmaz)", () => {
    const before = initial();
    const copy = structuredClone(before);
    expect(() =>
      applyTaskOps(
        before,
        [
          { op: "update", id: "t1", title: "değişti" },
          { op: "delete", id: "yok" },
        ],
        CTX,
      ),
    ).toThrow(TaskOpError);
    expect(before).toEqual(copy);
  });

  it("not başına görev sınırı aşılamaz", () => {
    const many = Array.from({ length: MAX_TASKS }, (_, i) => makeTask(`g${i}`, null, i));
    expect(() =>
      applyTaskOps(many, [{ op: "create", id: U1, parentId: null, position: -1 }], CTX),
    ).toThrow("Görev sınırına ulaşıldı");
  });
});

describe("fark (diffTasks)", () => {
  it("eklenen (üstten alta), güncellenen ve silinen görevleri ayırır", () => {
    const before = initial();
    const after = applyTaskOps(
      before,
      [
        { op: "create", id: U1, parentId: null, position: 10 },
        { op: "create", id: U2, parentId: U1, position: 0 },
        { op: "update", id: "t3", title: "SEO!" },
        { op: "delete", id: "t5" },
      ],
      CTX,
    );
    // Eklenenler, çocuk önce gelse de üstten alta sıralanır.
    const d = diffTasks(before, [...after].reverse());
    expect(d.inserted.map((t) => t.id)).toEqual([U1, U2]);
    expect(d.updated.map((t) => t.id)).toEqual(["t3"]);
    expect(d.deleted).toEqual(["t5"]);
  });

  it("değişiklik yoksa boş", () => {
    expect(diffTasks(initial(), initial())).toEqual({ inserted: [], updated: [], deleted: [] });
  });

  it("örnek ağaç tutarlı: fromSpec çocukları üstün ardından üretir", () => {
    expect(fromSpec([{ id: "a", kids: [{ id: "b" }] }]).map((t) => t.parentId)).toEqual([
      null,
      "a",
    ]);
  });
});
