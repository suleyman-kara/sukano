/** Ayarlar ekranının küçük metin yardımcıları. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5 dakika önce", "dün", "3 ay önce"… */
export function relativeAgo(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "az önce";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} dakika önce`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} saat önce`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "dün";
  if (days < 30) return `${days} gün önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

/** Hesap ve güvenlik → Oturumlar satırı. `total`: bu cihaz dahil açık oturum sayısı. */
export function sessionSummary(total: number): string {
  const others = Math.max(0, total - 1);
  const head = others ? `Bu cihaz ve ${others} cihaz daha` : "Yalnızca bu cihaz";
  return `${head} · oturumlar 30 gün açık kalır`;
}
