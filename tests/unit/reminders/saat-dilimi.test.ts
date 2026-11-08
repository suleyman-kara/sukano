import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER_TIME,
  quickReminderOptions,
  reminderChipLabel,
  reminderMomentLabel,
  resolveTimeZone,
  taskReminderAt,
  timeZoneLabel,
  zonedParts,
  zonedToUtc,
} from "~/domain/reminders/time";

const IST = "Europe/Istanbul";
const BER = "Europe/Berlin";
const NY = "America/New_York";
/** İstanbul'da Cuma, 6 Kasım 2026, 10:00 (07:00Z). */
const FRI_10 = Date.UTC(2026, 10, 6, 7, 0);

describe("yerel saat → UTC", () => {
  it("İstanbul'da yaz kış aynı fark (UTC+3) uygulanır", () => {
    expect(zonedToUtc("2026-11-09", "09:00", IST)).toBe(Date.UTC(2026, 10, 9, 6, 0));
    expect(zonedToUtc("2026-07-01", "09:00", IST)).toBe(Date.UTC(2026, 6, 1, 6, 0));
  });

  it("Berlin'de yaz saatinde UTC+2, kışın UTC+1 uygulanır", () => {
    expect(zonedToUtc("2026-07-01", "09:00", BER)).toBe(Date.UTC(2026, 6, 1, 7, 0));
    expect(zonedToUtc("2026-11-09", "09:00", BER)).toBe(Date.UTC(2026, 10, 9, 8, 0));
  });

  it("ileri saat geçişinde olmayan yerel saat boşluk kadar ileri kayar", () => {
    // New York, 8 Mart 2026 02:30 yoktur (02:00 → 03:00); 03:30 EDT = 07:30Z.
    expect(zonedToUtc("2026-03-08", "02:30", NY)).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });

  it("geri saat geçişinde iki kez yaşanan saat ilkini (yaz saatini) seçer", () => {
    // New York, 1 Kasım 2026 01:30 iki kez: EDT (05:30Z) ve EST (06:30Z).
    expect(zonedToUtc("2026-11-01", "01:30", NY)).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });

  it("geçersiz saat dilimi varsayılan İstanbul'a döner", () => {
    expect(resolveTimeZone("Mars/Olympus")).toBe(IST);
    expect(resolveTimeZone("")).toBe(IST);
    expect(resolveTimeZone(null)).toBe(IST);
    expect(resolveTimeZone(BER)).toBe(BER);
    expect(zonedToUtc("2026-11-09", "09:00", "Yok/Böyle")).toBe(Date.UTC(2026, 10, 9, 6, 0));
  });

  it("UTC anı saat dilimindeki tarih ve saate çevrilir", () => {
    expect(zonedParts(Date.UTC(2026, 10, 6, 22, 30), IST)).toEqual({
      date: "2026-11-07",
      time: "01:30",
    });
    expect(zonedParts(Date.UTC(2026, 10, 6, 22, 30), NY)).toEqual({
      date: "2026-11-06",
      time: "17:30",
    });
  });
});

describe("görev hatırlatıcısının anı", () => {
  it("saati olan bitiş tarihi o saatte çalar", () => {
    expect(taskReminderAt("2026-11-12", "17:00", IST)).toBe(Date.UTC(2026, 10, 12, 14, 0));
  });

  it("saati olmayan bitiş tarihi varsayılan 09:00'da çalar", () => {
    expect(DEFAULT_REMINDER_TIME).toBe("09:00");
    expect(taskReminderAt("2026-11-12", null, IST)).toBe(Date.UTC(2026, 10, 12, 6, 0));
  });

  it("bitiş tarihi yoksa hatırlatıcı anı yoktur", () => {
    expect(taskReminderAt(null, "17:00", IST)).toBeNull();
  });
});

describe("hızlı hatırlatıcı seçenekleri", () => {
  it("sabah: Bugün 18:00, Yarın 09:00 ve gelecek pazartesi 09:00", () => {
    expect(quickReminderOptions(FRI_10, IST)).toEqual([
      { key: "bugun", label: "Bugün", hint: "18:00", date: "2026-11-06", time: "18:00" },
      { key: "yarin", label: "Yarın", hint: "Cmt, 09:00", date: "2026-11-07", time: "09:00" },
      {
        key: "hafta",
        label: "Gelecek hafta",
        hint: "Pzt, 9 Kas, 09:00",
        date: "2026-11-09",
        time: "09:00",
      },
    ]);
  });

  it("akşam 18:00'den sonra Bugün seçeneği yoktur", () => {
    const evening = Date.UTC(2026, 10, 6, 15, 30); // 18:30 İstanbul
    expect(quickReminderOptions(evening, IST).map((o) => o.key)).toEqual(["yarin", "hafta"]);
  });

  it("seçenekler kişinin saat diliminin gününe göre hesaplanır", () => {
    // 07:00Z: İstanbul'da Cuma 10:00, New York'ta Cuma 02:00.
    const [first] = quickReminderOptions(FRI_10, NY);
    expect(first).toMatchObject({ key: "bugun", date: "2026-11-06" });
  });
});

describe("hatırlatıcı metinleri", () => {
  it("çip: Bugün, Yarın ya da gün ve ay", () => {
    expect(reminderChipLabel(Date.UTC(2026, 10, 6, 15, 0), FRI_10, IST)).toBe("Bugün, 18:00");
    expect(reminderChipLabel(Date.UTC(2026, 10, 7, 6, 0), FRI_10, IST)).toBe("Yarın, 09:00");
    expect(reminderChipLabel(Date.UTC(2026, 10, 9, 6, 0), FRI_10, IST)).toBe("9 Kas, 09:00");
    expect(reminderChipLabel(Date.UTC(2027, 0, 4, 6, 0), FRI_10, IST)).toBe("4 Oca 2027, 09:00");
  });

  it("bildirim satırı: bugün, dün, yarın küçük harfle", () => {
    expect(reminderMomentLabel(Date.UTC(2026, 10, 6, 6, 0), FRI_10, IST)).toBe("bugün 09:00");
    expect(reminderMomentLabel(Date.UTC(2026, 10, 5, 6, 0), FRI_10, IST)).toBe("dün 09:00");
    expect(reminderMomentLabel(Date.UTC(2026, 10, 7, 6, 0), FRI_10, IST)).toBe("yarın 09:00");
    expect(reminderMomentLabel(Date.UTC(2026, 10, 2, 6, 0), FRI_10, IST)).toBe("2 Kas, 09:00");
  });

  it("saat dilimi adı okunur biçimde yazılır", () => {
    expect(timeZoneLabel(IST)).toBe("İstanbul");
    expect(timeZoneLabel(NY)).toBe("New York");
    expect(timeZoneLabel("UTC")).toBe("UTC");
  });
});
