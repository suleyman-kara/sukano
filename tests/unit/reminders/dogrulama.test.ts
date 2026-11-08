import { describe, expect, it } from "vitest";
import { parseNotificationIntent, parseReminderIntent } from "~/domain/reminders/validation";

const NOTE = "0b5a3c1e-2f4d-4e6a-9b8c-7d6e5f4a3b2c";

describe("hatırlatıcı istekleri", () => {
  it("not hatırlatıcısı tarih, saat ve isteğe bağlı saat dilimiyle çözülür", () => {
    expect(
      parseReminderIntent({
        intent: "note",
        noteId: NOTE,
        date: "2026-11-09",
        time: "09:00",
        timeZone: "Europe/Berlin",
      }),
    ).toEqual({
      ok: true,
      value: {
        intent: "note",
        noteId: NOTE,
        date: "2026-11-09",
        time: "09:00",
        timeZone: "Europe/Berlin",
      },
    });
    expect(
      parseReminderIntent({
        intent: "note",
        noteId: NOTE,
        date: "2026-11-09",
        time: "09:00",
        timeZone: "x/y",
      }),
    ).toMatchObject({ ok: true, value: { timeZone: null } });
  });

  it("geçersiz tarih, saat ya da not reddedilir", () => {
    expect(
      parseReminderIntent({ intent: "note", noteId: NOTE, date: "2026-02-30", time: "09:00" }),
    ).toEqual({
      ok: false,
      error: "Geçerli bir tarih seç",
    });
    expect(
      parseReminderIntent({ intent: "note", noteId: NOTE, date: "2026-02-03", time: "25:00" }),
    ).toEqual({
      ok: false,
      error: "Geçerli bir saat seç",
    });
    expect(parseReminderIntent({ intent: "note", noteId: "../x" })).toEqual({
      ok: false,
      error: "Not bulunamadı",
    });
    expect(parseReminderIntent({ intent: "yok", noteId: NOTE })).toEqual({
      ok: false,
      error: "Geçersiz istek",
    });
  });

  it("kaldırma ve görev anahtarı", () => {
    expect(parseReminderIntent({ intent: "note-clear", noteId: NOTE })).toEqual({
      ok: true,
      value: { intent: "note-clear", noteId: NOTE },
    });
    expect(parseReminderIntent({ intent: "task", noteId: NOTE, taskId: "g1", on: "1" })).toEqual({
      ok: true,
      value: { intent: "task", noteId: NOTE, taskId: "g1", on: true, timeZone: null },
    });
    expect(
      parseReminderIntent({ intent: "task", noteId: NOTE, taskId: "g1", on: "0" }),
    ).toMatchObject({
      ok: true,
      value: { on: false },
    });
    expect(
      parseReminderIntent({ intent: "task", noteId: NOTE, taskId: "g1", on: "belki" }).ok,
    ).toBe(false);
    expect(parseReminderIntent({ intent: "task", noteId: NOTE, taskId: "", on: "1" })).toEqual({
      ok: false,
      error: "Görev bulunamadı",
    });
  });
});

describe("bildirim istekleri", () => {
  it("okundu: tek kimlik ya da virgüllü liste", () => {
    expect(parseNotificationIntent({ intent: "read", id: "a1" })).toEqual({
      ok: true,
      value: { intent: "read", ids: ["a1"] },
    });
    expect(parseNotificationIntent({ intent: "read", ids: "a1, b2" })).toEqual({
      ok: true,
      value: { intent: "read", ids: ["a1", "b2"] },
    });
    expect(parseNotificationIntent({ intent: "read", ids: "" }).ok).toBe(false);
    expect(parseNotificationIntent({ intent: "read", ids: "a b" }).ok).toBe(false);
  });

  it("tümünü okundu say, tercih ve saat dilimi", () => {
    expect(parseNotificationIntent({ intent: "read-all" })).toEqual({
      ok: true,
      value: { intent: "read-all" },
    });
    expect(parseNotificationIntent({ intent: "pref", key: "push.davet", value: "0" })).toEqual({
      ok: true,
      value: { intent: "pref", key: "push.davet", value: false },
    });
    expect(parseNotificationIntent({ intent: "pref", key: "push.yok", value: "0" }).ok).toBe(false);
    expect(parseNotificationIntent({ intent: "pref", key: "email.davet", value: "x" }).ok).toBe(
      false,
    );
    expect(parseNotificationIntent({ intent: "time-zone", timeZone: "Asia/Tokyo" })).toEqual({
      ok: true,
      value: { intent: "time-zone", timeZone: "Asia/Tokyo" },
    });
    expect(parseNotificationIntent({ intent: "time-zone", timeZone: "Yok" }).ok).toBe(false);
    expect(parseNotificationIntent({}).ok).toBe(false);
  });
});
