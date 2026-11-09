/**
 * Ortak düzenleme parçasının (`collab.ts`: Yjs, y-protocols, Collaboration eklentileri)
 * tembel yükleyicisi. Bu modül küçüktür; ızgaradaki kartlar onu içe aktarıp parçayı not
 * açılmadan önce (üzerine gelince, odaklanınca, dokununca) indirmeye başlar. Not açıldığında
 * parça hazırsa `useLiveNote` sağlayıcıyı ilk çizimde kurar: editör bir kez, doğrudan ortak
 * düzenleme eklentileriyle oluşur (önce düz editör kurulup sonra değiştirilmez).
 */
import type * as CollabModuleType from "./collab";

export type CollabModule = typeof CollabModuleType;

let loaded: CollabModule | null = null;
let pending: Promise<CollabModule> | null = null;

/** Parçayı yükler (bir kez; başarısız olursa sonraki çağrı yeniden dener). */
export function loadCollab(): Promise<CollabModule> {
  pending ??= import("./collab").then(
    (m) => (loaded = m),
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/** Yüklendiyse modül (eşzamanlı), değilse `null`. */
export function loadedCollab(): CollabModule | null {
  return loaded;
}

/** Arka planda yüklemeye başlar; hata yutulur (açılışta yeniden denenir). */
export function preloadCollab(): void {
  if (loaded) return;
  loadCollab().catch(() => {});
}
