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
