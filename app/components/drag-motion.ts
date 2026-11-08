import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";
import { cssEase, DURATION } from "~/lib/motion";

/**
 * Sürükle-bırak hareketi (MicroMotion 9), not ızgarası ve görev satırları için ortak:
 * kaldırma `.drag-lift` (1,03 ölçek + gölge, eğim yok), komşular 180 ms ease-out kayar,
 * bırakma 180 ms yaylı eğri. Azaltılmış harekette bırakma anında (`dropAnimation={null}`),
 * komşuların kayması taban CSS kuralıyla anında biter.
 */
export const DROP_ANIMATION: DropAnimation = {
  duration: DURATION.small * 1000,
  easing: cssEase("spring"),
  // Bırakma sürerken asıl öğe gizli kalır (iki kopya görünmez).
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

/** `useSortable({ transition })`: komşu satırların kayması. */
export const SORT_TRANSITION = { duration: DURATION.small * 1000, easing: cssEase("out") };
