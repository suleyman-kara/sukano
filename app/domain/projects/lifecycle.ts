/**
 * Proje yaşam döngüsü süreleri ve metinleri: silinmiş projenin 7 günlük bekleme
 * süresi, davet geçerliliği, kişisel notu projeye taşımanın geri alma penceresi.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Silinmiş proje bu süre sonunda kalıcı silinir (PLAN §4). */
export const PROJECT_RETENTION_MS = 7 * DAY;
export const PROJECT_RETENTION_DAYS = 7;

/** Taşıma toast'ı süresi: bu süre içinde "Geri al" (PLAN §10). */
export const MOVE_UNDO_MS = 10_000;
/** Sunucuda ağ gecikmesi payı: toast'ın son anında basılan "Geri al" da kabul edilir. */
export const MOVE_UNDO_GRACE_MS = 5_000;

/** Silinmiş proje kalıcı silinme zamanına geldi mi? */
export function isPurgeDue(deletedAt: Date, now: Date): boolean {
  return now.getTime() - deletedAt.getTime() >= PROJECT_RETENTION_MS;
}

/** Kalıcı silinmeye kalan tam gün (0–7, yukarı yuvarlanır). */
export function purgeDaysLeft(deletedAt: Date, now: Date): number {
  const remaining = PROJECT_RETENTION_MS - Math.max(0, now.getTime() - deletedAt.getTime());
  return Math.min(PROJECT_RETENTION_DAYS, Math.max(0, Math.ceil(remaining / DAY)));
}

/** "5 gün kaldı" · "yarın silinecek" · "bugün silinecek" (Silinmiş projeler listesi). */
export function purgeLabel(days: number): string {
  if (days <= 0) return "bugün silinecek";
  if (days === 1) return "yarın silinecek";
  return `${days} gün kaldı`;
}

/** "13 gün sonra geçersiz" · "yarın geçersiz" · "süresi doldu". */
export function inviteExpiryLabel(expiresAt: Date, now: Date): string {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return "süresi doldu";
  const days = Math.ceil(remaining / DAY);
  return days === 1 ? "yarın geçersiz" : `${days} gün sonra geçersiz`;
}

/** Taşıma hâlâ geri alınabilir mi? */
export function canUndoMove(movedAt: Date, now: Date): boolean {
  return now.getTime() - movedAt.getTime() <= MOVE_UNDO_MS + MOVE_UNDO_GRACE_MS;
}
