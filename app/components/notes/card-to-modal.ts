import { useCallback, useEffect, useRef } from "react";
import { cssEase, DURATION } from "~/lib/motion";

/**
 * Karttan modala paylaşılan geçiş (MicroMotion 3): açık not, tıklanan kartın yerinden
 * büyür (large 320 ms, yaylı eğri), kapanırken kartın yerine küçülerek döner (240 ms,
 * ease-in). Açık not ayrı bir rota olduğu için Motion `layoutId` yerine FLIP + Web
 * Animations API kullanılır; yalnızca transform ve opacity değişir.
 * Azaltılmış harekette yerinden büyüme yoktur (örtü ve modal anında gelir).
 */

type Origin = { id: string; rect: DOMRect; at: number };
let origin: Origin | null = null;

/** Kart açılırken çağrılır: kartın ekrandaki yeri (2 sn geçerli). */
export function rememberCardOrigin(id: string, el: Element | null) {
  if (!el) return;
  origin = { id, rect: el.getBoundingClientRect(), at: Date.now() };
}

function takeCardOrigin(id: string): DOMRect | null {
  const o = origin;
  origin = null;
  if (!o || o.id !== id || Date.now() - o.at > 2000) return null;
  return o.rect;
}

function cardElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`article[data-note-id="${CSS.escape(id)}"]`);
}

/** `from` kutusundan `to` kutusuna (sol üst köşe kökenli) dönüşüm. */
function flip(from: DOMRect, to: DOMRect): string {
  const sx = to.width ? from.width / to.width : 1;
  const sy = to.height ? from.height / to.height : 1;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
}

const canAnimate = (el: HTMLElement | null): el is HTMLElement =>
  Boolean(el && typeof el.animate === "function");

/**
 * Açılış: kart biliniyorsa yerinden büyür, değilse .96 → 1 ölçek + saydamlık. Diyalog
 * içeriği portala bir sonraki geçişte bağlandığı için geri çağırmalı ref döner; hareket
 * öğe ilk bağlandığında bir kez oynar.
 */
export function useCardToModalEnter(
  id: string,
  reduced: boolean,
): (el: HTMLElement | null) => void {
  const played = useRef(false);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || played.current) return;
      played.current = true;
      const from = takeCardOrigin(id);
      if (reducedRef.current || !canAnimate(el)) return;
      const to = el.getBoundingClientRect();
      const start = from
        ? { transformOrigin: "top left", transform: flip(from, to), opacity: 0.4 }
        : { transformOrigin: "center top", transform: "scale(0.96)", opacity: 0 };
      el.animate(
        [start, { transformOrigin: start.transformOrigin, transform: "none", opacity: 1 }],
        {
          duration: (from ? DURATION.large : DURATION.small) * 1000,
          easing: cssEase(from ? "spring" : "out"),
        },
      );
    },
    [id],
  );
}

/**
 * Kapanış: modal kartın yerine küçülür (kart görünmüyorsa yerinde solar), sonra `done`.
 * Kesilebilir: süren açılış animasyonu bulunduğu kareden tersine döner.
 */
export function closeToCard(
  id: string,
  el: HTMLElement | null,
  reduced: boolean,
  done: () => void,
) {
  if (reduced || !canAnimate(el)) return done();
  const from = el.getBoundingClientRect();
  const card = cardElement(id);
  const to = card?.getBoundingClientRect();
  const visible = to && to.bottom > 0 && to.top < window.innerHeight && to.width > 0;
  // Süren açılış animasyonu durdurulur; kapanış bulunduğu kareden başlar.
  const current = getComputedStyle(el).transform;
  el.getAnimations().forEach((a) => a.cancel());
  const startTransform = current && current !== "none" ? current : "none";
  const end = visible
    ? { transformOrigin: "top left", transform: flip(to, from), opacity: 0 }
    : { transformOrigin: "center top", transform: "scale(0.96)", opacity: 0 };
  const anim = el.animate(
    [{ transformOrigin: end.transformOrigin, transform: startTransform, opacity: 1 }, end],
    { duration: DURATION.medium * 1000, easing: cssEase("in"), fill: "forwards" },
  );
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  const overlay = el.previousElementSibling;
  if (overlay instanceof HTMLElement && overlay.dataset.slot === "dialog-overlay") {
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION.medium * 1000,
      easing: cssEase("in"),
      fill: "forwards",
    });
  }
  anim.addEventListener("finish", finish);
  anim.addEventListener("cancel", finish);
  // Sekme arka plandayken animasyon ilerlemeyebilir: en geç süre + pay sonra kapat.
  setTimeout(finish, DURATION.medium * 1000 + 120);
}

/** Kapanınca odak açılan kartın bağlantısına döner (klavye kullanıcısı yerini kaybetmez). */
export function focusCard(id: string): boolean {
  const link = cardElement(id)?.querySelector<HTMLElement>("a[data-open]");
  if (!link) return false;
  link.focus({ preventScroll: true });
  return true;
}
