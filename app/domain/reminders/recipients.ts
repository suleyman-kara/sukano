/**
 * Hatırlatıcı alıcı kuralı (PLAN §3):
 * - Not hatırlatıcısı: kişisel notta sahibine, proje notunda projedeki herkese.
 * - Görev hatırlatıcısı: yalnızca atananlara; atanan yoksa kurana.
 * Proje notunda alıcılar her zaman projenin şu anki üyeleriyle sınırlıdır (ayrılan ya da
 * çıkarılan kişiye gitmez).
 */
import type { ReminderTarget } from "~/db/schema";

export type RecipientInput = {
  target: ReminderTarget;
  /** Kişisel notun sahibi; proje notunda null. */
  ownerUserId: string | null;
  /** Proje notunda projenin şu anki üyeleri. */
  projectMemberIds: readonly string[];
  /** Görev hatırlatıcısında görevin atananları. */
  assigneeIds?: readonly string[];
  /** Hatırlatıcıyı kuran (hesabı silindiyse null). */
  setterId: string | null;
};

const unique = (ids: readonly string[]) => [...new Set(ids)];

export function reminderRecipients(input: RecipientInput): string[] {
  if (input.ownerUserId) return [input.ownerUserId];
  const members = new Set(input.projectMemberIds);
  if (input.target === "note") return unique(input.projectMemberIds);
  const assignees = unique(input.assigneeIds ?? []).filter((id) => members.has(id));
  if ((input.assigneeIds ?? []).length > 0) return assignees;
  return input.setterId && members.has(input.setterId) ? [input.setterId] : [];
}

export type SkipInput = {
  target: ReminderTarget;
  noteTrashed: boolean;
  projectDeleted: boolean;
  taskExists?: boolean;
  taskDone?: boolean;
};

/** Zamanı gelse de gönderilmeyecek (ama "gönderildi" sayılacak) hatırlatıcı. */
export function shouldSkipReminder(input: SkipInput): boolean {
  if (input.noteTrashed || input.projectDeleted) return true;
  if (input.target === "task") return !input.taskExists || Boolean(input.taskDone);
  return false;
}
