/**
 * Üye listesi ve kişiye özel proje sırası. Saf yardımcılar: sunucu loader'ları ve
 * arayüz (kişi seçici, sol menü sürükleme) aynı sırayı üretir.
 */
import type { ProjectRole } from "~/db/schema";

const ROLE_RANK: Record<ProjectRole, number> = { yonetici: 0, duzenleyici: 1, goruntuleyici: 2 };

const collator = new Intl.Collator("tr", { sensitivity: "base" });

/** "Sen" önce; sonra rol (yönetici → düzenleyici → görüntüleyici); sonra ad (Türkçe). */
export function sortMembers<T extends { userId: string; name: string; role: ProjectRole }>(
  members: readonly T[],
  meId: string,
): T[] {
  return [...members].sort(
    (a, b) =>
      Number(b.userId === meId) - Number(a.userId === meId) ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      collator.compare(a.name, b.name),
  );
}

/** Kişisel sıradaki projeler önce (o sırayla), kalanlar ada göre. */
export function orderProjects<T extends { id: string; name: string }>(
  projects: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...projects].sort(
    (a, b) =>
      (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
      collator.compare(a.name, b.name),
  );
}

/** `movedId`'yi `toIndex` sırasına taşır (`arrayMove` anlamı); yoksa listeyi aynen döner. */
export function reorderIds(ids: readonly string[], movedId: string, toIndex: number): string[] {
  const from = ids.indexOf(movedId);
  if (from === -1) return [...ids];
  const out = ids.filter((id) => id !== movedId);
  out.splice(Math.max(0, Math.min(toIndex, out.length)), 0, movedId);
  return out;
}
