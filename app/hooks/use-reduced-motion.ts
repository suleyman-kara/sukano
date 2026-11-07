import { useCallback, useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const isReduced = () =>
  document.documentElement.dataset.motion === "reduced" ||
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * Hareketi azalt (PLAN §10): sistem tercihi ya da `<html data-motion="reduced">` (Ayarlar).
 * Motion bileşenleri bu durumda hiç kullanılmaz; sunucuda `true` (ilk boyamada hareket yok).
 */
export function useReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    media.addEventListener("change", onChange);
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    return () => {
      media.removeEventListener("change", onChange);
      observer.disconnect();
    };
  }, []);
  return useSyncExternalStore(subscribe, isReduced, () => true);
}
