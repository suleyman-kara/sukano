/**
 * Yeniden bağlanma bekleme süresi: üstel artış + tavan + eşit dağılımlı titreşim
 * (aynı anda kopan istemciler sunucuya aynı anda yüklenmesin).
 *
 * `attempt` 0'dan başlar (ilk yeniden deneme). Varsayılan çizelge (titreşimsiz):
 * 500 ms, 1 s, 2 s, 4 s, 8 s, 15 s, 15 s …
 */
export type BackoffOptions = {
  /** İlk bekleme (ms). */
  base?: number;
  /** Çarpan. */
  factor?: number;
  /** Tavan (ms). */
  max?: number;
  /** Titreşim oranı (0–1): süre ±%(jitter×100) aralığında rastgele. */
  jitter?: number;
};

export const BACKOFF_DEFAULTS: Required<BackoffOptions> = {
  base: 500,
  factor: 2,
  max: 15_000,
  jitter: 0.2,
};

export function reconnectDelay(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const { base, factor, max, jitter } = { ...BACKOFF_DEFAULTS, ...options };
  const n = Math.max(0, Math.floor(Number.isFinite(attempt) ? attempt : 0));
  const raw = Math.min(max, base * Math.pow(factor, n));
  const spread = raw * Math.min(1, Math.max(0, jitter));
  const value = raw - spread + random() * spread * 2;
  return Math.round(Math.min(max, Math.max(0, value)));
}

/** İlk `count` denemenin titreşimsiz çizelgesi (belgeleme ve test için). */
export function backoffSchedule(count: number, options: BackoffOptions = {}): number[] {
  return Array.from({ length: count }, (_, i) => reconnectDelay(i, { ...options, jitter: 0 }));
}
