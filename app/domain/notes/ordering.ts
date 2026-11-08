/**
 * Not sıralaması. Konumlar (`notes.position`) kesirli sayıdır; küçük olan önce
 * gelir. Taşımada yalnızca taşınan notun konumu iki komşusunun ortasına çekilir;
 * komşular arasındaki boşluk {@link MIN_POSITION_GAP}'in altına inerse bölüm
 * (sabitlenmiş ya da diğerleri) 0, 1, 2 … diye yeniden numaralanır.
 */

/** Bu boşluğun altında kayan nokta hassasiyeti tükenmeye başlar; yeniden numaralandır. */
export const MIN_POSITION_GAP = 1e-6;

export type Positioned = { id: string; position: number };

export type MovePlan = {
  /** Tüm bölüm yeniden numaralandı mı? */
  renumbered: boolean;
  /** Veritabanına yazılacak yeni konumlar (değişmeyenler yok). */
  updates: Positioned[];
};

/** İki komşu arasında bir konum. Komşu yoksa uçtan bir birim uzaklaşır. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/** Listenin en üstüne eklenecek notun konumu. */
export function topPosition(positions: readonly number[]): number {
  if (positions.length === 0) return 0;
  return Math.min(...positions) - 1;
}

const byPosition = <T extends Positioned>(a: T, b: T) => a.position - b.position;

/**
 * `movingId` notunu bölümde `toIndex` sırasına taşır (taşıma sonrası dizin;
 * `arrayMove` ile aynı anlam). Bölüm konuma göre sıralanarak ele alınır.
 */
export function planMove(
  section: readonly Positioned[],
  movingId: string,
  toIndex: number,
): MovePlan {
  const sorted = [...section].sort(byPosition);
  const from = sorted.findIndex((n) => n.id === movingId);
  if (from === -1) return { renumbered: false, updates: [] };
  const to = Math.max(0, Math.min(toIndex, sorted.length - 1));
  if (from === to) return { renumbered: false, updates: [] };

  const [moving] = sorted.splice(from, 1);
  sorted.splice(to, 0, moving!);

  const before = sorted[to - 1]?.position ?? null;
  const after = sorted[to + 1]?.position ?? null;
  const tooTight = before !== null && after !== null && after - before < MIN_POSITION_GAP * 2;
  if (tooTight) {
    return {
      renumbered: true,
      updates: sorted.map((n, i) => ({ id: n.id, position: i })),
    };
  }
  return {
    renumbered: false,
    updates: [{ id: movingId, position: positionBetween(before, after) }],
  };
}

/** Notları "Sabitlenmiş" ve "Diğerleri" bölümlerine ayırır; her biri konuma göre sıralı. */
export function splitPinned<T extends Positioned & { pinned: boolean }>(
  notes: readonly T[],
): { pinned: T[]; others: T[] } {
  const sorted = [...notes].sort(byPosition);
  return { pinned: sorted.filter((n) => n.pinned), others: sorted.filter((n) => !n.pinned) };
}
