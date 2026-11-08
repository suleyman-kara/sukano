/**
 * Hatırlatıcı ve bildirim uçlarının form doğrulaması (`POST /api/hatirlaticilar`,
 * `POST /api/bildirimler`). Hata metinleri Türkçe, arayüzde aynen gösterilir.
 */
import { PREF_KEYS, type PrefKey } from "~/domain/notifications/prefs";
import { isNoteId } from "~/domain/notes/validation";
import { isValidDate, isValidTime } from "~/domain/tasks/dates";
import { isTaskId } from "~/domain/tasks/ops";
import { isValidTimeZone } from "./time";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type ReminderIntent =
  | { intent: "note"; noteId: string; date: string; time: string; timeZone: string | null }
  | { intent: "note-clear"; noteId: string }
  | { intent: "task"; noteId: string; taskId: string; on: boolean; timeZone: string | null };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const zone = (v: unknown) => (isValidTimeZone(v) ? v : null);
const bad = (error: string) => ({ ok: false as const, error });

export function parseReminderIntent(form: Record<string, unknown>): Result<ReminderIntent> {
  const noteId = form.noteId;
  if (!isNoteId(noteId)) return bad("Not bulunamadı");
  switch (form.intent) {
    case "note": {
      const date = str(form.date);
      const time = str(form.time);
      if (!isValidDate(date)) return bad("Geçerli bir tarih seç");
      if (!isValidTime(time)) return bad("Geçerli bir saat seç");
      return {
        ok: true,
        value: { intent: "note", noteId, date, time, timeZone: zone(form.timeZone) },
      };
    }
    case "note-clear":
      return { ok: true, value: { intent: "note-clear", noteId } };
    case "task": {
      if (!isTaskId(form.taskId)) return bad("Görev bulunamadı");
      const on = form.on === "1" || form.on === "true";
      if (!on && form.on !== "0" && form.on !== "false") return bad("Geçersiz istek");
      return {
        ok: true,
        value: { intent: "task", noteId, taskId: form.taskId, on, timeZone: zone(form.timeZone) },
      };
    }
    default:
      return bad("Geçersiz istek");
  }
}

export type NotificationIntent =
  | { intent: "read"; ids: string[] }
  | { intent: "read-all" }
  | { intent: "pref"; key: PrefKey; value: boolean }
  | { intent: "time-zone"; timeZone: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseNotificationIntent(form: Record<string, unknown>): Result<NotificationIntent> {
  switch (form.intent) {
    case "read": {
      const ids = str(form.ids || form.id)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0 || ids.length > 100 || !ids.every((id) => ID.test(id)))
        return bad("Geçersiz istek");
      return { ok: true, value: { intent: "read", ids } };
    }
    case "read-all":
      return { ok: true, value: { intent: "read-all" } };
    case "pref": {
      const key = str(form.key) as PrefKey;
      if (!PREF_KEYS.includes(key)) return bad("Geçersiz ayar");
      if (form.value !== "1" && form.value !== "0") return bad("Geçersiz ayar");
      return { ok: true, value: { intent: "pref", key, value: form.value === "1" } };
    }
    case "time-zone":
      return isValidTimeZone(form.timeZone)
        ? { ok: true, value: { intent: "time-zone", timeZone: form.timeZone } }
        : bad("Geçersiz saat dilimi");
    default:
      return bad("Geçersiz istek");
  }
}
