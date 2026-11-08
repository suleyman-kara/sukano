/**
 * Not eylemlerinin (form verisi) doğrulanması. Sunucu (`/api/notlar` action) ve
 * istemci (iyimser arayüz) aynı tipleri kullanır.
 */
import { NOTE_COLORS, NOTE_KINDS, type NoteColor, type NoteKind } from "~/db/schema";

export const MAX_TITLE_LENGTH = 1000;
export const MAX_BODY_LENGTH = 200_000;
/** Yeni yapılacaklar notuyla birlikte gönderilebilecek en çok görev. */
export const MAX_INITIAL_TASKS = 500;

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === "string" && (NOTE_COLORS as readonly string[]).includes(value);
}

export function isNoteKind(value: unknown): value is NoteKind {
  return typeof value === "string" && (NOTE_KINDS as readonly string[]).includes(value);
}

/** Not kimliği: UUID ya da tohum verisindeki kısa çizgili adlar. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** İstemcinin ürettiği yeni kimlikler UUID olmalı. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isNoteId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type NoteIntent =
  | {
      intent: "create";
      id: string;
      title: string;
      bodyHtml: string;
      color: NoteColor;
      pinned: boolean;
      /** Proje notu ise proje (yoksa kişisel alan). */
      projectId?: string;
    }
  | {
      intent: "create-todo";
      id: string;
      title: string;
      color: NoteColor;
      pinned: boolean;
      /** Üst seviye görev başlıkları (sırayla). */
      tasks: string[];
      projectId?: string;
    }
  | { intent: "update"; id: string; title?: string; bodyHtml?: string }
  | { intent: "convert"; id: string; to: NoteKind }
  | { intent: "color"; id: string; color: NoteColor }
  | { intent: "pin"; id: string; pinned: boolean }
  | { intent: "archive" | "unarchive" | "trash" | "restore" | "delete" | "discard"; id: string }
  | { intent: "empty-trash"; projectId?: string }
  | { intent: "duplicate"; id: string; newId: string }
  | { intent: "move"; id: string; pinned: boolean; toIndex: number }
  | { intent: "restore-version"; id: string; versionId: string }
  /** "Taşı veya kopyala…" → Taşı: kişisel notu projeye taşır (10 sn geri alınabilir). */
  | { intent: "move-to-project"; id: string; projectId: string }
  /** Taşıma toast'ındaki "Geri al". */
  | { intent: "undo-move"; id: string }
  /** "Kopyala…" / "Taşı veya kopyala…" → Kopyala; `projectId` null ise kişisel alana. */
  | { intent: "copy-to"; id: string; newId: string; projectId: string | null };

export type IntentName = NoteIntent["intent"];

export type ParseResult = { ok: true; value: NoteIntent } | { ok: false; error: string };

type Input = Record<string, unknown>;

const fail = (error: string): ParseResult => ({ ok: false, error });

function text(input: Input, key: string, max: number): string | undefined | null {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || v.length > max) return null;
  return v;
}

function bool(v: unknown): boolean | null {
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return null;
}

/** `tasks` alanı: başlıklardan oluşan JSON dizisi (form verisinde metin). */
function taskTitles(v: unknown): string[] | null {
  if (v === undefined || v === null || v === "") return [];
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_INITIAL_TASKS ||
    !parsed.every((t) => typeof t === "string" && t.length <= MAX_TITLE_LENGTH)
  ) {
    return null;
  }
  return parsed as string[];
}

/** İsteğe bağlı proje kimliği: yok/boş → undefined, geçersiz → null. */
function projectIdOf(input: Input): string | undefined | null {
  const v = input.projectId;
  if (v === undefined || v === null || v === "") return undefined;
  return isNoteId(v) ? v : null;
}

/** Form verisini (`Object.fromEntries(formData)`) doğrular. */
export function parseNoteIntent(input: Input): ParseResult {
  const intent = input.intent;
  const projectId = projectIdOf(input);
  if (projectId === null) return fail("Geçersiz proje");
  if (intent === "empty-trash")
    return { ok: true, value: projectId ? { intent, projectId } : { intent } };

  const id = input.id;
  if (!isNoteId(id)) return fail("Geçersiz not kimliği");

  switch (intent) {
    case "create": {
      if (!isUuid(id)) return fail("Geçersiz not kimliği");
      const title = text(input, "title", MAX_TITLE_LENGTH);
      const bodyHtml = text(input, "bodyHtml", MAX_BODY_LENGTH);
      if (title === null || bodyHtml === null) return fail("Not çok uzun");
      const color = input.color ?? "default";
      if (!isNoteColor(color)) return fail("Geçersiz renk");
      const pinned = bool(input.pinned ?? "false");
      if (pinned === null) return fail("Geçersiz sabitleme");
      return {
        ok: true,
        value: {
          intent,
          id,
          title: title ?? "",
          bodyHtml: bodyHtml ?? "",
          color,
          pinned,
          projectId,
        },
      };
    }
    case "create-todo": {
      if (!isUuid(id)) return fail("Geçersiz not kimliği");
      const title = text(input, "title", MAX_TITLE_LENGTH);
      if (title === null) return fail("Not çok uzun");
      const color = input.color ?? "default";
      if (!isNoteColor(color)) return fail("Geçersiz renk");
      const pinned = bool(input.pinned ?? "false");
      if (pinned === null) return fail("Geçersiz sabitleme");
      const tasks = taskTitles(input.tasks);
      if (tasks === null) return fail("Geçersiz görevler");
      return {
        ok: true,
        value: { intent, id, title: title ?? "", color, pinned, tasks, projectId },
      };
    }
    case "convert": {
      if (!isNoteKind(input.to)) return fail("Geçersiz dönüşüm");
      return { ok: true, value: { intent, id, to: input.to } };
    }
    case "update": {
      const title = text(input, "title", MAX_TITLE_LENGTH);
      const bodyHtml = text(input, "bodyHtml", MAX_BODY_LENGTH);
      if (title === null || bodyHtml === null) return fail("Not çok uzun");
      if (title === undefined && bodyHtml === undefined) return fail("Değişiklik yok");
      return { ok: true, value: { intent, id, title, bodyHtml } };
    }
    case "color": {
      if (!isNoteColor(input.color)) return fail("Geçersiz renk");
      return { ok: true, value: { intent, id, color: input.color } };
    }
    case "pin": {
      const pinned = bool(input.pinned);
      if (pinned === null) return fail("Geçersiz sabitleme");
      return { ok: true, value: { intent, id, pinned } };
    }
    case "archive":
    case "unarchive":
    case "trash":
    case "restore":
    case "delete":
    case "discard":
      return { ok: true, value: { intent, id } };
    case "duplicate": {
      if (!isUuid(input.newId)) return fail("Geçersiz kopya kimliği");
      return { ok: true, value: { intent, id, newId: input.newId } };
    }
    case "move": {
      const pinned = bool(input.pinned);
      const toIndex = Number(input.toIndex);
      if (pinned === null || !Number.isInteger(toIndex) || toIndex < 0) {
        return fail("Geçersiz sıra");
      }
      return { ok: true, value: { intent, id, pinned, toIndex } };
    }
    case "restore-version": {
      if (!isNoteId(input.versionId)) return fail("Geçersiz sürüm");
      return { ok: true, value: { intent, id, versionId: input.versionId } };
    }
    case "move-to-project":
      if (!projectId) return fail("Geçersiz proje");
      return { ok: true, value: { intent, id, projectId } };
    case "undo-move":
      return { ok: true, value: { intent, id } };
    case "copy-to": {
      if (!isUuid(input.newId)) return fail("Geçersiz kopya kimliği");
      return { ok: true, value: { intent, id, newId: input.newId, projectId: projectId ?? null } };
    }
    default:
      return fail("Bilinmeyen işlem");
  }
}

/** Eylemi form alanlarına çevirir (istemcide `submit` için). */
export function intentToForm(intent: NoteIntent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(intent)) {
    if (v !== undefined && v !== null) out[k] = Array.isArray(v) ? JSON.stringify(v) : String(v);
  }
  return out;
}
