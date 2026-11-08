import { MotionConfig } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";

/**
 * Azaltılmış hareketin tek noktadan yönetimi (MotionSpec): Motion bileşenleri sistem
 * ayarına ve Ayarlar › "Hareketi azalt" seçimine birlikte uyar (`data-motion`).
 */
export function MotionPreferenceConfig({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>;
}
