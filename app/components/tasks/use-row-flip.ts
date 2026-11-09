import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssEase, DURATION } from "~/lib/motion";

/**
 * Alt görev aç / kapa (MicroMotion 7): liste yüksekliği hareketle değişir. Durum anında
 * uygulanır (girdi kilitlenmez); altta kalan satırlar eski yerlerinden yeni yerlerine kayar
 * (FLIP, yalnızca transform): açılırken 240 ms ease-out, kapanırken 180 ms ease-in. Yeni
 * görünen alt satırlar `.task-enter` ile belirir; kapanışta kaybolan alt satırların
 * kopyası eski yerinde 180 ms ease-in ile yukarıdan aşağı kırpılarak ve solarak kapanır
 * (yükseklik kapanışı; satırlar React'te anında kalkar). Azaltılmış harekette yok.
 *
 * `record()` durum değişmeden hemen önce çağrılır; bir sonraki çizimde fark oynatılır.
 */
export function useRowFlip(root: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const before = useRef<Map<string, number> | null>(null);
  const ghosts = useRef<Map<string, { node: HTMLElement; height: number }>>(new Map());

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
    ghosts.current = new Map();
    el.querySelectorAll<HTMLElement>("[data-task-row]").forEach((row) => {
      const id = row.dataset.taskRow ?? "";
      const rect = row.getBoundingClientRect();
      map.set(id, rect.top - base);
      // Kapanışta kaybolabilecek satırların (alt görevler, Tamamlananlar) kopyası saklanır.
      ghosts.current.set(id, { node: row.cloneNode(true) as HTMLElement, height: rect.height });
    });
    before.current = map;
  });

  useLayoutEffect(() => {
    const old = before.current;
    const el = root.current;
    before.current = null;
    if (!old || !el) return;
    const base = el.getBoundingClientRect().top;
    const present = new Set<string>();
    el.querySelectorAll<HTMLElement>("[data-task-row]").forEach((row) => {
      present.add(row.dataset.taskRow ?? "");
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
    const saved = ghosts.current;
    ghosts.current = new Map();
    for (const [id, { node, height }] of saved) {
      const was = old.get(id);
      if (present.has(id) || was === undefined || typeof node.animate !== "function") continue;
      collapseGhost(el, node, was, height);
    }
  });

  return record;
}

/** Kaybolan satırın kopyası eski yerinde kapanır, sonra kaldırılır (etkileşimsiz, gizli). */
function collapseGhost(root: HTMLElement, node: HTMLElement, top: number, height: number) {
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  node.removeAttribute("data-task-row");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("inert", "");
  node.dataset.kapanan = "";
  node.classList.remove("task-enter");
  Object.assign(node.style, {
    position: "absolute",
    top: `${top}px`,
    left: "0",
    right: "0",
    height: `${height}px`,
    overflow: "hidden",
    pointerEvents: "none",
    transform: "none",
  });
  root.appendChild(node);
  const anim = node.animate(
    [
      { opacity: 1, clipPath: "inset(0 0 0 0)" },
      { opacity: 0, clipPath: "inset(0 0 100% 0)" },
    ],
    { duration: DURATION.small * 1000, easing: cssEase("in"), fill: "forwards" },
  );
  const remove = () => node.remove();
  anim.onfinish = remove;
  anim.oncancel = remove;
}
