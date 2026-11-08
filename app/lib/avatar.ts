/** Beyaz metinle ≥ 4,5:1 avatar renkleri (tasarımdaki örnek kullanıcılar). */
const AVATAR_COLORS = ["#597895", "#B25D49", "#4976B4", "#7A5FB8", "#398264", "#8A6420"];

/** Kullanıcının avatar rengi yoksa kimliğinden kararlı bir renk türetir. */
export function avatarColorFor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
