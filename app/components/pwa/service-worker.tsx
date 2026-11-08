import { useEffect } from "react";
import { useLocation } from "react-router";
import { SERVICE_WORKER_URL } from "~/components/notifications/push-client";

/**
 * Service worker kaydı ve çevrimdışı okuma için sayfa önbelleği (PLAN §5, `public/sw.js`).
 *
 * - Üretim derlemesinde (önizleme dahil) `/sw.js` kaydedilir; geliştirme sunucusunda
 *   kaydedilmez (Vite modülleri önbelleğe girmesin).
 * - İlk açılışta service worker sayfayı henüz denetlemediği için yüklenmiş JS / CSS / yazı
 *   tipi adresleri ona bildirilir (`varliklar`), önbelleğe alır.
 * - Oturum varken açılan her sayfa (istemci tarafı gezinme dahil) kısa bir süre görünür
 *   kaldıktan sonra service worker'a bildirilir (`sayfa`): belgeyi oturum çereziyle bir kez
 *   alıp o oturumun önbelleğine koyar. Çevrimdışıyken yeniden yüklenen sayfa buradan gelir.
 */
export function ServiceWorkerManager({ signedIn }: { signedIn: boolean }) {
  const location = useLocation();
  const path = location.pathname + location.search;

  useEffect(() => {
    if (!serviceWorkerEnabled()) return;
    let cancelled = false;
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!cancelled) reg.active?.postMessage({ type: "varliklar", urls: loadedAssetUrls() });
      })
      .catch(() => {
        // Kayıt başarısızsa uygulama service worker'sız (çevrimiçi) çalışır.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signedIn || !serviceWorkerEnabled()) return;
    const timer = setTimeout(() => {
      if (!navigator.onLine) return;
      void navigator.serviceWorker.ready.then((reg) => {
        // Bu sayfanın sonradan (tembel) yüklediği parçalar da çevrimdışı için saklansın.
        reg.active?.postMessage({ type: "varliklar", urls: loadedAssetUrls() });
        reg.active?.postMessage({ type: "sayfa", url: path });
      });
    }, PAGE_CACHE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedIn, path]);

  return null;
}

/** Sayfa bu kadar görünür kaldıktan sonra önbelleğe alınır (hızlı geçişler sayılmaz). */
export const PAGE_CACHE_DELAY_MS = 800;

function serviceWorkerEnabled(): boolean {
  return import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** Sayfanın yüklediği aynı kökenli statik dosyalar (derleme çıktısı ve yazı tipleri). */
function loadedAssetUrls(): string[] {
  const urls = new Set<string>();
  const add = (href: string | null | undefined) => {
    if (!href) return;
    const url = new URL(href, location.href);
    if (url.origin === location.origin && /^\/(assets|fonts)\//.test(url.pathname)) {
      urls.add(url.pathname);
    }
  };
  for (const entry of performance.getEntriesByType("resource")) add(entry.name);
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"], link[rel="stylesheet"]')
    .forEach((l) => add(l.href));
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => add(s.src));
  return [...urls];
}
