/**
 * İstek ölçümü (Server-Timing). Saf durum ve biçimleyici; D1 sarmalayıcısı
 * `app/lib/db-timing.server.ts`, başlığı `workers/app.ts` yazar.
 *
 * `db` süresi duvar saatidir: en az bir sorgu uçarken geçen süre (paralel sorgular üst üste
 * sayılmaz). `queries` sorgu sayısı, `trips` sırayla beklenen tur (gidiş-dönüş) sayısı (paralel
 * sorgular tek gidiş sayılır): üretimde her gidiş birincil veritabanına bir yolculuktur.
 */
export type RequestTiming = {
  /** İsteğin başladığı an (ms). */
  start: number;
  queries: number;
  trips: number;
  dbMs: number;
  /** Uçan sorgu sayısı ve ilkinin başladığı an. */
  inflight: number;
  inflightSince: number;
  /** Yalnızca yerel ölçüm: her sorgudan önce yapay gecikme (ms). */
  delayMs: number;
};

export function createTiming(now: number, delayMs = 0): RequestTiming {
  return { start: now, queries: 0, trips: 0, dbMs: 0, inflight: 0, inflightSince: 0, delayMs };
}

/** Sorgu başladı. */
export function queryStarted(t: RequestTiming, now: number) {
  t.queries += 1;
  if (t.inflight === 0) {
    t.trips += 1;
    t.inflightSince = now;
  }
  t.inflight += 1;
}

/** Sorgu bitti (başarılı ya da hatalı). */
export function queryFinished(t: RequestTiming, now: number) {
  t.inflight = Math.max(0, t.inflight - 1);
  if (t.inflight === 0) t.dbMs += now - t.inflightSince;
}

const ms = (n: number) => Math.max(0, Math.round(n * 10) / 10);

/** `Server-Timing` başlığının değeri: `total;dur=…, db;dur=…;desc="3 sorgu / 2 tur"`. */
export function serverTimingValue(t: RequestTiming, now: number): string {
  const total = `total;dur=${ms(now - t.start)}`;
  if (t.queries === 0) return total;
  return `${total}, db;dur=${ms(t.dbMs)};desc="${t.queries} sorgu / ${t.trips} tur"`;
}

/** Yerel ölçüm başlığı: geçerli bir tam sayı (0–2000 ms) değilse 0. */
export function parseDelayHeader(value: string | null): number {
  if (!value || !/^\d{1,4}$/.test(value)) return 0;
  return Math.min(2000, Number(value));
}

/** Uçtan uca ölçümde D1 gecikmesi isteyen başlık (yalnızca yerel adreste geçerli). */
export const DB_DELAY_HEADER = "x-sukano-db-gecikme";
