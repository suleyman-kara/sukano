import { useCallback, useMemo } from "react";
import { useRevalidator, type ShouldRevalidateFunctionArgs } from "react-router";
import { isPublicPath } from "~/domain/auth/redirects";

/**
 * Yeniden doğrulama kuralları. React Router'ın tek istek (single fetch) kipinde varsayılan,
 * HER gezinmede eşleşen bütün loader'ları yeniden çalıştırmaktır: kart açmak bile kabuğu
 * (oturum, projeler, sayaçlar) ve ızgarayı yeniden yükletirdi. Burada her rota yalnızca kendi
 * verisi değiştiğinde yüklenir:
 *
 * - **Çevrimdışı** (PLAN §5): hiç yeniden doğrulama yok; ekrandaki veri kalır.
 * - **Eylemden sonra** (form / fetcher): React Router'ın kararı (4xx hatada yok). Kabuk, not
 *   içeriğini değiştiren eylemlerden sonra yüklenmez (`revalidateShell`).
 * - **`revalidator.revalidate()`** (aynı adres): yeniden yüklenir.
 * - **Gezinme**: rotanın verisini belirleyen anahtar değiştiyse (`revalidateOwnData`).
 */

type Args = Pick<
  ShouldRevalidateFunctionArgs,
  "currentUrl" | "nextUrl" | "formMethod" | "formAction" | "defaultShouldRevalidate"
>;

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const isMutation = (args: Args) =>
  Boolean(args.formMethod && args.formMethod.toUpperCase() !== "GET");

const sameAddress = (a: URL, b: URL) => a.pathname + a.search === b.pathname + b.search;

/**
 * Kabuk verisini (kullanıcı, projeler, davet / bildirim sayıları, saat dilimi, hareket)
 * değiştirmeyen eylemler: not, görev, ek ve hatırlatıcı uçları. Bildirim rozeti canlı
 * kanaldan güncellenir (bkz. `useUnreadCount`).
 */
const NOTE_CONTENT_ACTIONS = /^\/api\/(notlar|ekler|hatirlaticilar)(\/|$)/;

function actionPath(formAction: string | undefined): string {
  if (!formAction) return "";
  try {
    return new URL(formAction, "http://x").pathname.replace(/\.data$/, "");
  } catch {
    return "";
  }
}

/**
 * Kök loader (kabuk): gezinmede yüklenmez (yalnızca herkese açık sayfa ↔ uygulama sınırında);
 * not içeriği eylemlerinden sonra yüklenmez; diğer eylemlerden ve `revalidate()`'ten sonra
 * yüklenir.
 */
export function revalidateShell(args: Args): boolean {
  if (isOffline()) return false;
  if (isMutation(args)) {
    if (NOTE_CONTENT_ACTIONS.test(actionPath(args.formAction))) return false;
    return args.defaultShouldRevalidate;
  }
  if (sameAddress(args.currentUrl, args.nextUrl)) {
    return contentOnly > 0 ? false : args.defaultShouldRevalidate;
  }
  return isPublicPath(args.currentUrl.pathname) !== isPublicPath(args.nextUrl.pathname);
}

/** Süren içerik yeniden doğrulamaları (`useContentRevalidator`); kabuk bunlarda yüklenmez. */
let contentOnly = 0;

/**
 * Not içeriği için yeniden doğrulama (canlı ızgara olayı, kartta görev, ek, görev eşitleme):
 * `useRevalidator` gibi, ama kabuk (kök loader) yeniden yüklenmez; yalnızca ızgara ve açık not.
 */
export function useContentRevalidator() {
  const revalidator = useRevalidator();
  const { revalidate: run, state } = revalidator;
  const revalidate = useCallback(async () => {
    contentOnly += 1;
    try {
      await run();
    } finally {
      contentOnly -= 1;
    }
  }, [run]);
  return useMemo(() => ({ revalidate, state }), [revalidate, state]);
}

/** Açık notun ve yan panellerin sorgu parametreleri; ızgaranın verisini değiştirmez. */
const MODAL_PARAMS = ["surumler", "tasi", "hatirlatici"];

/**
 * Izgara rotalarının (Notlarım, Arşiv, Çöp, proje, arama) veri anahtarı: açık not alt yolu
 * (`/not/:id`) ve modal parametreleri atılmış adres. Kart açıp kapatmak ızgarayı yüklemez;
 * başka proje ya da başka arama yükler.
 */
export function gridDataKey(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const p of MODAL_PARAMS) params.delete(p);
  const search = params.toString();
  return (url.pathname.replace(/\/not\/[^/]+\/?$/, "") || "/") + (search ? `?${search}` : "");
}

/** Açık notun veri anahtarı: yol (not kimliği); `?surumler` gibi parametreler yüklemez. */
export const noteDataKey = (url: URL) => url.pathname;

/** Yalnızca `key(adres)` değiştiğinde (ya da eylem / `revalidate()` sonrası) yükle. */
export function revalidateOwnData(key: (url: URL) => string) {
  return (args: Args): boolean => {
    if (isOffline()) return false;
    if (isMutation(args)) return args.defaultShouldRevalidate;
    if (sameAddress(args.currentUrl, args.nextUrl)) return args.defaultShouldRevalidate;
    return key(args.currentUrl) !== key(args.nextUrl);
  };
}

/** Izgara rotaları: `export const shouldRevalidate = revalidateGrid`. */
export const revalidateGrid = revalidateOwnData(gridDataKey);

/** Açık not rotası: `export const shouldRevalidate = revalidateNote`. */
export const revalidateNote = revalidateOwnData(noteDataKey);
