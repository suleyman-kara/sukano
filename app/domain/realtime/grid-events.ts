/**
 * Canlı ızgara olayları: proje (ya da kişisel alan) kanalına, değişiklik D1'e
 * yazıldıktan sonra yayınlanan küçük iletiler. İstemci olayı ızgaraya hemen uygular
 * (`applyChannelEvent`: iyimser arayüzle aynı kurallar, `applyPendingIntents`) ve
 * yerel olarak kurulamayan durumlarda (yeni not, içerik değişikliği, görünüme giren
 * not) loader'ları yeniden doğrular.
 */
import { NOTE_COLORS, type NoteColor } from "~/db/schema";
import { applyPendingIntents, type NoteCardData, type NoteView } from "~/domain/notes/optimistic";
import type { NoteIntent } from "~/domain/notes/validation";

type NoteEvent<T extends string, X = object> = { type: T; noteId: string } & X;

export type ChannelEventBody =
  /** Alanda yeni not (oluşturma, kopya, taşınıp gelme, taşıma geri alınıp dönme). */
  | NoteEvent<"olusturuldu">
  /** Başlık, gövde, görevler ya da tür değişti. */
  | NoteEvent<"icerik">
  | NoteEvent<"renk", { color: NoteColor }>
  | NoteEvent<"sabit", { pinned: boolean }>
  | NoteEvent<"sira", { pinned: boolean; toIndex: number }>
  | NoteEvent<"arsivlendi">
  | NoteEvent<"arsivden-cikti">
  | NoteEvent<"cope-atildi">
  | NoteEvent<"geri-yuklendi">
  /** Not alandan ayrıldı (projeye taşındı ya da taşıma geri alındı). */
  | NoteEvent<"tasindi">
  /** Kalıcı silme, çöpü boşaltma, kopyanın geri alınması. */
  | { type: "silindi"; noteIds: string[] }
  /** Proje bilgisi ya da üye listesi değişti. */
  | { type: "proje" }
  /** Bir üyenin rolü değişti ya da projeden çıkarıldı / ayrıldı. */
  | { type: "uyelik"; userId: string }
  | { type: "proje-silindi" }
  /** Kişisel kanal: yeni bildirim ya da okundu durumu değişti (zil yeniden sayar). */
  | { type: "bildirim" };

/** Olayı yapan kişi (`by`) ve sunucu zamanı (`at`, ms) her olayda bulunur. */
export type ChannelEvent = ChannelEventBody & { by: string; at: number };

export type ChannelEventType = ChannelEvent["type"];

const NOTE_TYPES = new Set<string>([
  "olusturuldu",
  "icerik",
  "renk",
  "sabit",
  "sira",
  "arsivlendi",
  "arsivden-cikti",
  "cope-atildi",
  "geri-yuklendi",
  "tasindi",
]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Güvenilmeyen değeri doğrular; geçersizse null. */
export function parseChannelEvent(raw: unknown): ChannelEvent | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;
  if (typeof raw.by !== "string" || typeof raw.at !== "number") return null;
  const base = { by: raw.by, at: raw.at };
  if (NOTE_TYPES.has(raw.type)) {
    if (typeof raw.noteId !== "string" || !raw.noteId) return null;
    const noteId = raw.noteId;
    switch (raw.type) {
      case "renk":
        return NOTE_COLORS.includes(raw.color as NoteColor)
          ? { ...base, type: "renk", noteId, color: raw.color as NoteColor }
          : null;
      case "sabit":
        return typeof raw.pinned === "boolean"
          ? { ...base, type: "sabit", noteId, pinned: raw.pinned }
          : null;
      case "sira":
        return typeof raw.pinned === "boolean" &&
          typeof raw.toIndex === "number" &&
          Number.isInteger(raw.toIndex) &&
          raw.toIndex >= 0
          ? { ...base, type: "sira", noteId, pinned: raw.pinned, toIndex: raw.toIndex }
          : null;
      default:
        return { ...base, type: raw.type as "icerik", noteId };
    }
  }
  switch (raw.type) {
    case "silindi":
      return Array.isArray(raw.noteIds) && raw.noteIds.every((x) => typeof x === "string")
        ? { ...base, type: "silindi", noteIds: raw.noteIds as string[] }
        : null;
    case "uyelik":
      return typeof raw.userId === "string"
        ? { ...base, type: "uyelik", userId: raw.userId }
        : null;
    case "proje":
    case "proje-silindi":
    case "bildirim":
      return { ...base, type: raw.type };
    default:
      return null;
  }
}

/** Olayın ilgilendirdiği notlar. */
export function noteIdsOf(event: ChannelEventBody): string[] {
  if (event.type === "silindi") return event.noteIds;
  return "noteId" in event ? [event.noteId] : [];
}

export type GridPatch = { notes: NoteCardData[]; revalidate: boolean };

/** Görünümde olmayan ama bu olayla görünüme girecek notlar için yeniden doğrulama gerekir. */
const ENTERS: Record<NoteView, ChannelEventType[]> = {
  notlar: ["olusturuldu", "arsivden-cikti", "geri-yuklendi"],
  arsiv: ["arsivlendi", "geri-yuklendi"],
  cop: ["cope-atildi"],
};

/**
 * Olayı ızgaraya uygular. Yerelde kurulabilen değişiklikler (renk, sabit, sıra, görünümden
 * çıkma, silme) hemen uygulanır; diğerlerinde `revalidate: true`.
 */
export function applyChannelEvent(
  notes: readonly NoteCardData[],
  event: ChannelEventBody,
  view: NoteView,
): GridPatch {
  const has = (id: string) => notes.some((n) => n.id === id);
  const apply = (intent: NoteIntent, revalidate = false): GridPatch => ({
    notes: applyPendingIntents(notes, [intent], view),
    revalidate,
  });
  const same = (revalidate: boolean): GridPatch => ({ notes: [...notes], revalidate });

  if (ENTERS[view].includes(event.type)) return same(true);

  switch (event.type) {
    case "renk":
      return has(event.noteId)
        ? apply({ intent: "color", id: event.noteId, color: event.color })
        : same(false);
    case "sabit":
      return has(event.noteId)
        ? apply({ intent: "pin", id: event.noteId, pinned: event.pinned })
        : same(false);
    case "sira": {
      const note = notes.find((n) => n.id === event.noteId);
      if (!note || note.pinned !== event.pinned) return same(note !== undefined);
      return apply({
        intent: "move",
        id: event.noteId,
        pinned: event.pinned,
        toIndex: event.toIndex,
      });
    }
    case "arsivlendi":
      return apply({ intent: "archive", id: event.noteId });
    case "arsivden-cikti":
      return apply({ intent: "unarchive", id: event.noteId });
    case "cope-atildi":
      return apply({ intent: "trash", id: event.noteId });
    case "geri-yuklendi":
      return apply({ intent: "restore", id: event.noteId });
    case "tasindi":
      return { notes: notes.filter((n) => n.id !== event.noteId), revalidate: false };
    case "silindi": {
      const gone = new Set(event.noteIds);
      return { notes: notes.filter((n) => !gone.has(n.id)), revalidate: false };
    }
    case "icerik":
      return same(has(event.noteId));
    case "olusturuldu":
    case "bildirim":
      return same(false);
    case "proje":
    case "uyelik":
    case "proje-silindi":
      return same(true);
  }
}

/** Sırayla birden çok olay; herhangi biri isterse yeniden doğrulanır. */
export function applyChannelEvents(
  notes: readonly NoteCardData[],
  events: readonly ChannelEventBody[],
  view: NoteView,
): GridPatch {
  let out: GridPatch = { notes: [...notes], revalidate: false };
  for (const e of events) {
    const next = applyChannelEvent(out.notes, e, view);
    out = { notes: next.notes, revalidate: out.revalidate || next.revalidate };
  }
  return out;
}
