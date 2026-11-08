import { describe, expect, it } from "vitest";
import {
  MIN_POSITION_GAP,
  planMove,
  positionBetween,
  splitPinned,
  topPosition,
} from "~/domain/notes/ordering";

const list = (...positions: number[]) =>
  positions.map((position, i) => ({ id: `n${i}`, position }));

describe("sıralama: position hesapları", () => {
  it("iki komşunun arasına ekleme ortalamayı verir", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("yalnızca alt komşu varsa onun bir eksiği, yalnızca üst komşu varsa bir fazlası kullanılır", () => {
    expect(positionBetween(null, 4)).toBe(3);
    expect(positionBetween(4, null)).toBe(5);
    expect(positionBetween(null, null)).toBe(0);
  });

  it("yeni not en üste gelir: en küçük konumdan bir eksik", () => {
    expect(topPosition([3, -2, 7])).toBe(-3);
    expect(topPosition([])).toBe(0);
  });

  it("aşağı taşıma: hedefin altına yerleşir, tek kayıt güncellenir", () => {
    const plan = planMove(list(0, 1, 2, 3), "n0", 2);
    expect(plan).toEqual({ renumbered: false, updates: [{ id: "n0", position: 2.5 }] });
  });

  it("yukarı taşıma: hedefin üstüne yerleşir", () => {
    const plan = planMove(list(0, 1, 2, 3), "n3", 1);
    expect(plan.updates).toEqual([{ id: "n3", position: 0.5 }]);
  });

  it("en başa ve en sona taşıma uçlardan bir birim uzaklaşır", () => {
    expect(planMove(list(0, 1, 2), "n2", 0).updates).toEqual([{ id: "n2", position: -1 }]);
    expect(planMove(list(0, 1, 2), "n0", 2).updates).toEqual([{ id: "n0", position: 3 }]);
  });

  it("aynı yere taşıma ya da bilinmeyen kimlik değişiklik üretmez", () => {
    expect(planMove(list(0, 1, 2), "n1", 1).updates).toEqual([]);
    expect(planMove(list(0, 1, 2), "yok", 0).updates).toEqual([]);
  });

  it("hedef dizin aralık dışındaysa sınıra çekilir", () => {
    expect(planMove(list(0, 1, 2), "n0", 99).updates).toEqual([{ id: "n0", position: 3 }]);
    expect(planMove(list(0, 1, 2), "n2", -5).updates).toEqual([{ id: "n2", position: -1 }]);
  });

  it("komşular arasındaki boşluk eşiğin altına inince tüm bölüm yeniden numaralanır", () => {
    const tight = list(0, MIN_POSITION_GAP / 4, MIN_POSITION_GAP / 2);
    const plan = planMove(tight, "n2", 1);
    expect(plan.renumbered).toBe(true);
    expect(plan.updates).toEqual([
      { id: "n0", position: 0 },
      { id: "n2", position: 1 },
      { id: "n1", position: 2 },
    ]);
  });

  it("girdi sırası karışık olsa da konuma göre sıralanarak hesaplanır", () => {
    const shuffled = [
      { id: "c", position: 2 },
      { id: "a", position: 0 },
      { id: "b", position: 1 },
    ];
    expect(planMove(shuffled, "a", 1).updates).toEqual([{ id: "a", position: 1.5 }]);
  });
});

describe("sabitlenmiş ve diğerleri ayrımı", () => {
  it("notları sabitlenmiş ve diğerleri olarak ayırır, her biri konuma göre sıralanır", () => {
    const notes = [
      { id: "a", pinned: false, position: 2 },
      { id: "b", pinned: true, position: 5 },
      { id: "c", pinned: false, position: 1 },
      { id: "d", pinned: true, position: 0 },
    ];
    const { pinned, others } = splitPinned(notes);
    expect(pinned.map((n) => n.id)).toEqual(["d", "b"]);
    expect(others.map((n) => n.id)).toEqual(["c", "a"]);
  });
});
