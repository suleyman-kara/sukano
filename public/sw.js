/*
 * Sukano service worker — Aşama 5b: yalnızca Web Push.
 *
 * - `push`: sunucunun şifreli yükünü (`{ title, body, url, tag, action? }`) bildirim olarak
 *   gösterir.
 * - `notificationclick`: açık bir Sukano sekmesi varsa ona odaklanıp notun adresine gider,
 *   yoksa yeni pencere açar.
 *
 * Önbellek ve çevrimdışı (tam PWA) Aşama 6'da bu dosyaya eklenecek; `fetch` olayı bilerek
 * dinlenmez (istekler ağdan geçer).
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sukano", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sukano";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-maskable-192.png",
    lang: "tr",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    actions: data.action ? [{ action: "ac", title: data.action }] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (same) {
        await same.focus();
        if ("navigate" in same) return same.navigate(target);
        return undefined;
      }
      return self.clients.openWindow(target);
    })(),
  );
});
