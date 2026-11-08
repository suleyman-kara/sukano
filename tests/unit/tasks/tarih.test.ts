import { describe, expect, it } from "vitest";
import {
  addDays,
  fixRange,
  formatChip,
  formatDay,
  formatRange,
  isOverdue,
  isValidDate,
  isValidTime,
  parseNaturalDate,
  pickDate,
  quickDates,
  todayIn,
} from "~/domain/tasks/dates";

// Prototipteki gibi bugün Cuma, 6 Kasım 2026.
const TODAY = "2026-11-06";
const nl = (s: string) => parseNaturalDate(s, TODAY);

describe("doğal yazım tarih çözümleme", () => {
  it.each([
    ["bugün", "2026-11-06"],
    ["Bugün", "2026-11-06"],
    ["bugun", "2026-11-06"],
    ["yarın", "2026-11-07"],
    ["yarin", "2026-11-07"],
    ["öbür gün", "2026-11-08"],
    ["obur gun", "2026-11-08"],
    ["öbürgün", "2026-11-08"],
    ["gelecek hafta", "2026-11-09"],
    ["haftaya", "2026-11-09"],
    ["pazartesi", "2026-11-09"],
    ["salı", "2026-11-10"],
    ["carsamba", "2026-11-11"],
    ["perşembe", "2026-11-12"],
    ["cuma", "2026-11-13"],
    ["Cumartesi", "2026-11-07"],
    ["pazar", "2026-11-08"],
    ["15 kasım", "2026-11-15"],
    ["15 Kasım", "2026-11-15"],
    ["15 kasim", "2026-11-15"],
    ["15 kas", "2026-11-15"],
    ["15.11", "2026-11-15"],
    ["15/11", "2026-11-15"],
    ["15.11.2027", "2027-11-15"],
    ["1 şubat 2027", "2027-02-01"],
    ["3 ocak", "2027-01-03"],
    ["3.1", "2027-01-03"],
    ["  6   kasım ", "2026-11-06"],
  ])("%s → %s", (input, date) => {
    expect(nl(input)).toEqual({ date, time: null });
  });

  it("gün adı bugünü gösteriyorsa bir sonraki haftaya gider (cuma → gelecek cuma)", () => {
    expect(nl("cuma")!.date).toBe("2026-11-13");
    expect(parseNaturalDate("pazartesi", "2026-11-09")!.date).toBe("2026-11-16");
    expect(parseNaturalDate("gelecek hafta", "2026-11-09")!.date).toBe("2026-11-16");
  });

  it("saat eklenebilir: 'yarın 17:00', 'cuma saat 9.30', '15 kasım 08:05'", () => {
    expect(nl("yarın 17:00")).toEqual({ date: "2026-11-07", time: "17:00" });
    expect(nl("cuma saat 9.30")).toEqual({ date: "2026-11-13", time: "09:30" });
    expect(nl("15 kasım 08:05")).toEqual({ date: "2026-11-15", time: "08:05" });
    expect(nl("15.11 17:00")).toEqual({ date: "2026-11-15", time: "17:00" });
  });

  it.each([
    [""],
    ["   "],
    ["lorem"],
    ["31 kasım"],
    ["30 şubat"],
    ["0 kasım"],
    ["15 xyz"],
    ["32.1"],
    ["15.13"],
    ["yarın 25:00"],
    ["yarın 10:61"],
    ["17:00"],
    ["ma"],
  ])("geçersiz: %j → null", (input) => {
    expect(nl(input)).toBeNull();
  });

  it("yıl verilmeyen geçmiş tarih ertesi yıla gider; 29 şubat yalnızca artık yılda geçerli", () => {
    expect(parseNaturalDate("29 şubat", "2027-03-01")!.date).toBe("2028-02-29");
    expect(parseNaturalDate("29 şubat", "2026-03-01")).toBeNull();
    expect(parseNaturalDate("29 şubat 2028", TODAY)!.date).toBe("2028-02-29");
  });
});

describe("tarih aralığı metni", () => {
  it.each([
    [null, "2026-11-20", "20 Kas"],
    ["2026-11-12", "2026-11-20", "12 → 20 Kas"],
    ["2026-10-28", "2026-11-03", "28 Eki → 3 Kas"],
    [null, "2026-11-06", "Bugün"],
    ["2026-11-03", "2026-11-06", "3 Kas → Bugün"],
    ["2026-11-12", null, "12 Kas →"],
    ["2026-11-12", "2026-11-12", "12 Kas"],
    ["2026-11-20", "2026-11-12", "12 Kas"],
    [null, null, ""],
    [null, "2027-01-03", "3 Oca 2027"],
    ["2026-12-28", "2027-01-03", "28 Ara → 3 Oca 2027"],
    ["2027-03-01", "2027-03-09", "1 → 9 Mar 2027"],
    ["2025-12-30", null, "30 Ara 2025 →"],
  ])("%s → %s = %j", (start, due, text) => {
    expect(formatRange(start, due, TODAY)).toBe(text);
  });

  it("çip metni saati de taşır; aralık yoksa boş", () => {
    expect(formatChip("2026-11-03", "2026-11-12", "17:00", TODAY)).toBe("3 → 12 Kas, 17:00");
    expect(formatChip(null, "2026-11-12", null, TODAY)).toBe("12 Kas");
    expect(formatChip("2026-11-12", null, "17:00", TODAY)).toBe("12 Kas →");
    expect(formatChip(null, null, null, TODAY)).toBe("");
  });

  it("tek gün metni: '6 Kas', başka yılda '6 Kas 2027'", () => {
    expect(formatDay("2026-11-06", TODAY)).toBe("6 Kas");
    expect(formatDay("2027-11-06", TODAY)).toBe("6 Kas 2027");
    expect(formatDay(null, TODAY)).toBe("");
  });
});

describe("başlangıç ≤ bitiş kuralı", () => {
  it("başlangıç bitişten sonraysa başlangıç bitişe eşitlenir", () => {
    expect(fixRange({ startDate: "2026-11-15", dueDate: "2026-11-05" })).toEqual({
      startDate: "2026-11-05",
      dueDate: "2026-11-05",
    });
  });

  it("geçerli aralık ve tek uçlu aralık değişmez; girdi değiştirilmez", () => {
    const r = { startDate: "2026-11-01", dueDate: "2026-11-05" };
    expect(fixRange(r)).toEqual(r);
    expect(fixRange({ startDate: "2026-11-15", dueDate: null })).toEqual({
      startDate: "2026-11-15",
      dueDate: null,
    });
    const bad = { startDate: "2026-11-15", dueDate: "2026-11-05" };
    fixRange(bad);
    expect(bad.startDate).toBe("2026-11-15");
  });

  it("seçicide yuvaya tarih yazma: uyarılar prototiple aynı", () => {
    const r = { startDate: null, dueDate: "2026-11-20" };
    expect(pickDate(r, "start", "2026-11-10")).toEqual({
      startDate: "2026-11-10",
      dueDate: "2026-11-20",
      warning: null,
    });
    expect(
      pickDate({ startDate: "2026-11-10", dueDate: "2026-11-20" }, "due", "2026-11-05"),
    ).toEqual({
      startDate: "2026-11-05",
      dueDate: "2026-11-05",
      warning: "Bitiş başlangıçtan önce; başlangıç bitişe eşitlendi.",
    });
    expect(
      pickDate({ startDate: "2026-11-05", dueDate: "2026-11-05" }, "start", "2026-11-15"),
    ).toEqual({
      startDate: "2026-11-05",
      dueDate: "2026-11-05",
      warning: "Başlangıç bitişten sonra olamaz; bitişe eşitlendi.",
    });
  });
});

describe("tarih yardımcıları", () => {
  it("gecikmiş: bitiş bugünden önce ve görev açık", () => {
    expect(isOverdue("2026-11-04", TODAY)).toBe(true);
    expect(isOverdue("2026-11-06", TODAY)).toBe(false);
    expect(isOverdue(null, TODAY)).toBe(false);
    expect(isOverdue("2026-11-04", TODAY, true)).toBe(false);
  });

  it("hızlı seçenekler: Bugün, Yarın, Gelecek hafta (pazartesi)", () => {
    expect(quickDates(TODAY)).toEqual({
      today: "2026-11-06",
      tomorrow: "2026-11-07",
      nextWeek: "2026-11-09",
    });
  });

  it("bugün Türkiye saatine göre hesaplanır (UTC gece yarısından önce)", () => {
    expect(todayIn(new Date("2026-11-06T21:30:00Z"))).toBe("2026-11-07");
    expect(todayIn(new Date("2026-11-06T20:59:00Z"))).toBe("2026-11-06");
    expect(todayIn(new Date("2026-11-06T21:30:00Z"), "UTC")).toBe("2026-11-06");
  });

  it("gün ekleme, ay ve yıl sınırlarını geçer", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("tarih ve saat biçim denetimi", () => {
    expect(isValidDate("2026-11-06")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-1-6")).toBe(false);
    expect(isValidDate(42)).toBe(false);
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime(null)).toBe(false);
  });
});
