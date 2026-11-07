import { useCallback, useSyncExternalStore } from "react";

/** CSS medya sorgusunu izler. Sunucuda `serverValue` döner. */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Kırılma noktaları: mobil < 768 ≤ tablet < 1024 ≤ masaüstü (Tailwind md/lg). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const TABLET_UP_QUERY = "(min-width: 768px)";
