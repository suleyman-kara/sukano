/**
 * Not odasının belge tohumu: açık notun loader'ı, not odasındaki Yjs belgesinin o anki
 * durumunu (ve belge kimliğini) taşır. Tarayıcı belgesini bununla başlatır, böylece metin
 * düzenleyicisi WebSocket bağlantısını ve ilk eşitlemeyi beklemeden düzenlenebilir açılır.
 *
 * Tohum odadaki belgenin kendisidir (aynı öğe kimlikleri): eşitleme gelince Yjs eksik
 * olanları birleştirir, içerik çoğalmaz. Belge kimliği hoş geldindekinden farklıysa (oda
 * arada sıfırlandı) sağlayıcı tohumu atar ve yeniden kurulur (`note-provider.ts`).
 *
 * Durum base64 metin olarak taşınır (loader verisi JSON / turbo-stream).
 */
export type NoteCollabSeed = {
  /** Odadaki belgenin kimliği (`hosgeldin.docId`). */
  docId: string;
  /** `Y.encodeStateAsUpdate` çıktısı, base64. */
  state: string;
};

/** Bundan büyük belge tohumlanmaz (loader yükü); düzenleyici ilk eşitlemeyi bekler. */
export const MAX_SEED_BYTES = 256 * 1024;

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Geçersiz base64 → `null`. */
export function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Oda durumundan tohum; durum çok büyükse ya da kimlik yoksa `null`. */
export function encodeCollabSeed(docId: string, state: Uint8Array): NoteCollabSeed | null {
  if (!docId || state.byteLength === 0 || state.byteLength > MAX_SEED_BYTES) return null;
  return { docId, state: bytesToBase64(state) };
}

/** Tohumun durumu; biçim bozuksa `null` (sağlayıcı tohumsuz, eşitlemeyle açılır). */
export function decodeCollabSeed(
  seed: NoteCollabSeed | null | undefined,
): { docId: string; state: Uint8Array } | null {
  if (!seed || typeof seed.docId !== "string" || !seed.docId || typeof seed.state !== "string")
    return null;
  const state = base64ToBytes(seed.state);
  return state && state.byteLength > 0 ? { docId: seed.docId, state } : null;
}
