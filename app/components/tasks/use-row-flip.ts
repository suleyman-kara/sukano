import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssEase, DURATION } from "~/lib/motion";

/**
 * Alt görev aç / kapa (MicroMotion 7): liste yüksekliği hareketle değişir. Durum anında
 * uygulanır (girdi kilitlenmez); altta kalan satırlar eski yerlerinden yeni yerlerine kayar
 * (FLIP, yalnızca transform): açılırken 240 ms ease-out, kapanırken 180 ms ease-in. Yeni
 * görünen alt satırlar `.task-enter` ile belirir. Azaltılmış harekette yok.
 *
 * `record()` durum değişmeden hemen önce çağrılır; bir sonraki çizimde fark oynatılır.
 */
export function useRowFlip(root: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const before = useRef<Map<string, number> | null>(null);

  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // Kararlı işlev: yalnızca olay işleyicilerinde çağrılır.
  const [record] = useState(() => () => {
    const el = root.current;
    if (reducedRef.current || !el) return;
    const base = el.getBoundingClientRect().top;
    const map = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-task-row]").forEach((row) => {
      map.set(row.dataset.taskRow ?? "", row.getBoundingClientRect().top - base);
    });
    before.current = map;
  });

  useLayoutEffect(() => {
    const old = before.current;
    const el = root.current;
    before.current = null;
    if (!old || !el) return;
    const base = el.getBoundingClientRect().top;
    el.querySelectorAll<HTMLElement>("[data-task-row]").forEach((row) => {
      const was = old.get(row.dataset.taskRow ?? "");
      if (was === undefined || typeof row.animate !== "function") return;
      const dy = was - (row.getBoundingClientRect().top - base);
      if (Math.abs(dy) < 0.5) return;
      const opening = dy < 0;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: (opening ? DURATION.medium : DURATION.small) * 1000,
        easing: cssEase(opening ? "out" : "in"),
      });
    });
  });

  return record;
}
