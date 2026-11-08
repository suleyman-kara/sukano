import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { closeHref } from "~/components/notes/note-links";
import { cssEase, DURATION } from "~/lib/motion";
import { useReducedMotion } from "./use-reduced-motion";

/** İlk (sunucu çizimi + hidrasyon) bağlanmada geçiş yok; sonraki her bölüm değişiminde var. */
let firstMountDone = false;

/**
 * Rota geçişi (MotionSpec: small 180 ms, ease-out, yalnızca saydamlık): bölüm değişince
 * (Notlarım → Arşiv, başka proje, ayarlar …) içerik solarak gelir. Aynı ızgarada not açıp
 * kapamak bölüm değiştirmez. Azaltılmış harekette yok.
 */
export function useRouteFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();
  const section = closeHref(pathname);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    if (!firstMountDone) {
      firstMountDone = true;
      return;
    }
    const el = ref.current;
    if (reducedRef.current || !el || typeof el.animate !== "function") return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION.small * 1000,
      easing: cssEase("out"),
    });
  }, [section]);
  return ref;
}
