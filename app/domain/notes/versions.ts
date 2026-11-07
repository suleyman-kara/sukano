/**
 * Sürüm kuralları (PLAN §3): aynı kişinin 5 dakika içindeki ardışık düzenlemeleri
 * tek sürüm sayılır (pencere sürümün oluşturulduğu andan başlar); son 50 sürüm tutulur.
 */

export const VERSION_WINDOW_MS = 5 * 60 * 1000;
export const MAX_VERSIONS = 50;

export type LatestVersion = { id: string; authorId: string | null; createdAt: Date };

export type VersionWrite = { action: "create" } | { action: "update"; versionId: string };

export function decideVersionWrite(
  latest: LatestVersion | null,
  authorId: string,
  now: Date,
  options: { forceNew?: boolean } = {},
): VersionWrite {
  if (!latest || options.forceNew) return { action: "create" };
  const sameAuthor = latest.authorId !== null && latest.authorId === authorId;
  const withinWindow = now.getTime() - latest.createdAt.getTime() < VERSION_WINDOW_MS;
  return sameAuthor && withinWindow
    ? { action: "update", versionId: latest.id }
    : { action: "create" };
}

/** Sınırı aşan en eski sürümlerin kimlikleri (silinecekler). */
export function versionsToPrune(
  versions: readonly { id: string; createdAt: Date }[],
  max: number = MAX_VERSIONS,
): string[] {
  if (versions.length <= max) return [];
  return [...versions]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, versions.length - max)
    .map((v) => v.id);
}

/**
 * Ortak düzenlemede sürüm kararı (NoteRoom'un periyodik D1 yazımı). `editors`: son
 * yazımdan bu yana belgeyi değiştiren kişiler, en son düzenleyen sonda.
 *
 * Kural yine "kişi başına + 5 dk": son sürümün sahibi bu aralıkta düzenleyenlerden
 * biriyse ve pencere açıksa o sürüm güncellenir (iki kişi aynı anda yazarken sürümler
 * her yazımda el değiştirmez); değilse en son düzenleyen adına yeni sürüm açılır.
 */
export type CollabVersionWrite =
  | { action: "update"; versionId: string; authorId: string }
  | { action: "create"; authorId: string }
  | { action: "none" };

export function decideCollabVersionWrite(
  latest: LatestVersion | null,
  editors: readonly string[],
  now: Date,
): CollabVersionWrite {
  const last = editors.at(-1);
  if (!last) return { action: "none" };
  if (
    latest &&
    latest.authorId !== null &&
    editors.includes(latest.authorId) &&
    now.getTime() - latest.createdAt.getTime() < VERSION_WINDOW_MS
  ) {
    return { action: "update", versionId: latest.id, authorId: latest.authorId };
  }
  return { action: "create", authorId: last };
}
