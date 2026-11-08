import type { ShouldRevalidateFunctionArgs } from "react-router";

/**
 * Çevrimdışıyken yeniden doğrulama yok (PLAN §5): veri ağdan gelemez; istenirse sayfa
 * hata görünümüne düşerdi. Ekrandaki (önbellekten ya da son eşitlemeden) veri kalır;
 * bağlantı gelince canlı katman ve sonraki gezinme yeniler. Izgara ve not rotaları
 * `export const shouldRevalidate = revalidateUnlessOffline` ile kullanır.
 */
export function revalidateUnlessOffline({
  defaultShouldRevalidate,
}: Pick<ShouldRevalidateFunctionArgs, "defaultShouldRevalidate">): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return defaultShouldRevalidate;
}
