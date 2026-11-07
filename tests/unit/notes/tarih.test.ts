import { describe, expect, it } from "vitest";
import {
  formatRelativeDateTime,
  formatShortDateTime,
  trashDaysLeft,
  trashLeftLabel,
} from "~/domain/notes/dates";

const now = new Date("2026-11-07T12:00:00Z"); // 15:00 İstanbul
const DAY = 86_400_000;

describe("tarih metinleri", () => {
  it("kısa tarih-saat İstanbul saatiyle yazılır", () => {
    expect(formatShortDateTime(new Date("2026-11-05T11:20:00Z"), now)).toBe("5 Kas, 14:20");
  });

  it("başka yıldaki tarihe yıl eklenir", () => {
    expect(formatShortDateTime(new Date("2025-03-01T06:05:00Z"), now)).toBe("1 Mar 2025, 09:05");
  });

  it("bugün ve dün göreli yazılır", () => {
    expect(formatRelativeDateTime(new Date("2026-11-07T11:20:00Z"), now)).toBe("Bugün, 14:20");
    expect(formatRelativeDateTime(new Date("2026-11-06T14:48:00Z"), now)).toBe("Dün, 17:48");
    expect(formatRelativeDateTime(new Date("2026-11-04T06:30:00Z"), now)).toBe("4 Kas, 09:30");
  });
});

describe("çöpte kalan gün", () => {
  it("yeni çöpe atılan not 7 gün sonra silinir", () => {
    expect(trashDaysLeft(now, now)).toBe(7);
  });

  it("geçen süre yukarı yuvarlanarak kalan gün hesaplanır", () => {
    expect(trashDaysLeft(new Date(now.getTime() - 1.5 * DAY), now)).toBe(6);
    expect(trashDaysLeft(new Date(now.getTime() - 6.9 * DAY), now)).toBe(1);
    expect(trashDaysLeft(new Date(now.getTime() - 9 * DAY), now)).toBe(0);
  });

  it("etiket", () => {
    expect(trashLeftLabel(3)).toBe("3 gün sonra silinir");
    expect(trashLeftLabel(0)).toBe("Bugün silinir");
  });
});
