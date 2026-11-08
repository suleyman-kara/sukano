import { describe, expect, it } from "vitest";
import { reminderRecipients, shouldSkipReminder } from "~/domain/reminders/recipients";

describe("hatırlatıcı alıcı kuralı", () => {
  it("kişisel not hatırlatıcısı yalnızca notun sahibine gider", () => {
    expect(
      reminderRecipients({
        target: "note",
        ownerUserId: "ayse",
        projectMemberIds: [],
        setterId: "ayse",
      }),
    ).toEqual(["ayse"]);
  });

  it("proje notu hatırlatıcısı projedeki herkese gider (kuran dahil)", () => {
    expect(
      reminderRecipients({
        target: "note",
        ownerUserId: null,
        projectMemberIds: ["ayse", "mehmet", "zeynep", "mehmet"],
        setterId: "ayse",
      }),
    ).toEqual(["ayse", "mehmet", "zeynep"]);
  });

  it("görev hatırlatıcısı atanan varsa yalnızca atananlara gider", () => {
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: null,
        projectMemberIds: ["ayse", "mehmet", "zeynep"],
        assigneeIds: ["zeynep", "mehmet"],
        setterId: "ayse",
      }),
    ).toEqual(["zeynep", "mehmet"]);
  });

  it("atanan yoksa görev hatırlatıcısı kurana gider", () => {
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: null,
        projectMemberIds: ["ayse", "mehmet"],
        assigneeIds: [],
        setterId: "mehmet",
      }),
    ).toEqual(["mehmet"]);
  });

  it("kişisel notta görev hatırlatıcısı sahibine gider", () => {
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: "ayse",
        projectMemberIds: [],
        setterId: "ayse",
      }),
    ).toEqual(["ayse"]);
  });

  it("projeden ayrılmış kişiye proje hatırlatıcısı gitmez", () => {
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: null,
        projectMemberIds: ["ayse"],
        assigneeIds: [],
        setterId: "can",
      }),
    ).toEqual([]);
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: null,
        projectMemberIds: ["ayse"],
        assigneeIds: ["can", "ayse"],
        setterId: "ayse",
      }),
    ).toEqual(["ayse"]);
  });

  it("kuranı silinmiş görev hatırlatıcısı atanan yoksa kimseye gitmez", () => {
    expect(
      reminderRecipients({
        target: "task",
        ownerUserId: null,
        projectMemberIds: ["ayse"],
        assigneeIds: [],
        setterId: null,
      }),
    ).toEqual([]);
  });
});

describe("gönderilmeyecek hatırlatıcılar", () => {
  it("çöpteki not, silinmiş proje, tamamlanmış ya da silinmiş görev atlanır", () => {
    const base = { noteTrashed: false, projectDeleted: false, target: "note" as const };
    expect(shouldSkipReminder(base)).toBe(false);
    expect(shouldSkipReminder({ ...base, noteTrashed: true })).toBe(true);
    expect(shouldSkipReminder({ ...base, projectDeleted: true })).toBe(true);
    expect(shouldSkipReminder({ ...base, target: "task", taskExists: false })).toBe(true);
    expect(shouldSkipReminder({ ...base, target: "task", taskExists: true, taskDone: true })).toBe(
      true,
    );
    expect(shouldSkipReminder({ ...base, target: "task", taskExists: true, taskDone: false })).toBe(
      false,
    );
  });
});
