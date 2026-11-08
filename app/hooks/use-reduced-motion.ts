import { useCallback, useSyncExternalStore } from "react";
import { currentMotionPreference, isReducedMotion, REDUCED_MOTION_QUERY } from "~/lib/motion";

export { REDUCED_MOTION_QUERY };

const isReduced = () =>
  isReducedMotion(currentMotionPreference(), window.matchMedia(REDUCED_MOTION_QUERY).matches);

/**
 * Hareketi azalt (PLAN §10): sistem tercihi (`prefers-reduced-motion`) ya da Ayarlar'daki
 * seçim (`<html data-motion="reduced|full">`; "full" sistemi geçersiz kılar). İkisi de
 * dinlenir; değişince süren hareket anında durur. Sunucuda `true` (ilk boyamada hareket yok).
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
