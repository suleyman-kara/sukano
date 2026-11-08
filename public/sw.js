/*
 * Sukano service worker — Web Push (Aşama 5b) + çevrimdışı okuma (Aşama 6, PLAN §5).
 *
 * Push
 * - `push`: sunucunun şifreli yükünü (`{ title, body, url, tag, action? }`) bildirim olarak
 *   gösterir.
 * - `notificationclick`: açık bir Sukano sekmesi varsa ona odaklanıp notun adresine gider,
 *   yoksa yeni pencere açar.
 *
 * Önbellek
 * - Statik dosyalar (`/assets/*` derleme çıktısı, yazı tipleri, simgeler): `sukano-statik-*`.
 *   Adı karma içeren derleme dosyaları önce önbellekten, diğerleri önbellekten verilip arkada
 *   yenilenir. Kullanıcıya özel değildir.
 * - Sayfalar (belge + React Router `.data` yanıtları): her zaman önce ağ. Yalnızca sunucunun
 *   `X-Sukano-Oturum` başlığıyla işaretlediği 200 yanıtlar, o oturumun kendi önbelleğine
 *   (`sukano-sayfa-<anahtar>`) en çok `MAX_PAGES` sayfa olarak yazılır. Ağ yoksa (çevrimdışı)
 *   aynı adres bu önbellekten, yoksa çevrimdışı sayfası (`/cevrimdisi`) verilir.
 * - Oturum yalıtımı: başlık `yok` gelirse (çıkış, hesap silme, oturum süresi doldu) ya da
 *   başka bir oturum anahtarı görülürse eski oturumların sayfa önbellekleri silinir;
 *   `POST /cikis` anında da silinir. Çevrimdışıyken yalnızca son görülen oturumun önbelleği
 *   okunur; bir oturumun sayfası başka oturuma hiç verilmez.
 * - Önbelleğe hiç girmeyenler: GET dışı istekler, başka kökenler, `/api/*` (WebSocket
 *   yükseltmeleri dahil), `/__test/*`, `/health`, `/cdn-cgi/*`.
 *
 * Sözleşme adları `app/domain/pwa/offline.ts` ile aynıdır (birim testi denetler).
 */
const VERSION = "v1";
const STATIC_CACHE = `sukano-statik-${VERSION}`;
const PAGE_CACHE_PREFIX = "sukano-sayfa-";
const META_CACHE = "sukano-meta";
const SESSION_HEADER = "X-Sukano-Oturum";
const NO_SESSION = "yok";
const SESSION_KEY_URL = "/__sw/oturum";
// Workers Static Assets `cevrimdisi.html`yi uzantısız adreste verir (uzantılı adres 307 ile
// yönlendirilir; yönlendirilmiş yanıt gezinmeye verilemez).
const OFFLINE_URL = "/cevrimdisi";
const MAX_PAGES = 40;
/** Aynı sayfa bu süre içinde yeniden alınmaz (`sayfa` iletisi). */
const PAGE_REFRESH_MS = 30_000;

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/fonts/onest-latin.woff2",
  "/fonts/onest-latin-ext.woff2",
];

/** Bellekteki oturum anahtarı (service worker yeniden başlarsa META_CACHE'ten okunur). */
let currentSession;
/** Sayfa adresi → son önbelleğe alma zamanı (ms). */
const lastStored = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("sukano-statik-") && n !== STATIC_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ---------------------------------------------------------------- oturum */

async function getSession() {
  if (currentSession !== undefined) return currentSession;
  const meta = await caches.open(META_CACHE);
  const hit = await meta.match(SESSION_KEY_URL);
  currentSession = hit ? await hit.text() : null;
  return currentSession;
}

async function setSession(key) {
  currentSession = key;
  const meta = await caches.open(META_CACHE);
  if (key) await meta.put(SESSION_KEY_URL, new Response(key));
  else await meta.delete(SESSION_KEY_URL);
}

/** Verilen oturum dışındaki (verilmezse tüm) sayfa önbelleklerini siler. */
async function clearPageCaches(keep) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((n) => n.startsWith(PAGE_CACHE_PREFIX) && n !== `${PAGE_CACHE_PREFIX}${keep}`)
      .map((n) => caches.delete(n)),
  );
  if (!keep) lastStored.clear();
}

async function signOut() {
  await setSession(null);
  await clearPageCaches();
}

/* ---------------------------------------------------------------- yönlendirme */

function isDataRequest(url) {
  return url.pathname.endsWith(".data");
}

function isBypassed(url) {
  return /^\/(api|__test|health|cdn-cgi|__sw)(\/|$)/.test(url.pathname);
}

function isStaticAsset(url) {
  return /^\/(assets|fonts|icons)\//.test(url.pathname) || PRECACHE.includes(url.pathname);
}

/** Sayfa önbelleğinin anahtarı: hash'siz adres (`.data` isteklerinde sorgu dahil). */
function pageKey(url) {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    // Çıkış: yanıtı beklemeden oturumun sayfaları silinir.
    if (request.method === "POST" && (url.pathname === "/cikis" || url.pathname === "/cikis.data"))
      event.waitUntil(signOut());
    return;
  }
  if (isBypassed(url) || request.headers.get("upgrade")) return;

  if (isStaticAsset(url)) {
    event.respondWith(staticResponse(event, request, url));
    return;
  }
  if (request.mode === "navigate" || isDataRequest(url)) {
    event.respondWith(pageResponse(event, request));
  }
});

async function staticResponse(event, request, url) {
  const cache = await caches.open(STATIC_CACHE);
  // `Vary: Origin` yok sayılır: modül betikleri Origin'li, önbelleğe alma isteği Origin'siz.
  const hit = await cache.match(request, { ignoreVary: true });
  const refresh = () =>
    fetch(request)
      .then(async (res) => {
        if (res.ok && res.type === "basic" && !res.redirected)
          await cache.put(request, res.clone());
        return res;
      })
      .catch(() => undefined);
  if (hit) {
    // Adı karma içeren derleme dosyası değişmez; diğerleri arkada yenilenir.
    if (!url.pathname.startsWith("/assets/")) event.waitUntil(refresh());
    return hit;
  }
  return (await refresh()) || Response.error();
}

async function pageResponse(event, request) {
  try {
    const res = await fetch(request);
    event.waitUntil(storePage(pageKey(request.url), res.clone()));
    return res;
  } catch {
    const cached = await cachedPage(pageKey(request.url));
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL, { ignoreVary: true });
      if (offline) return offline;
    }
    return Response.error();
  }
}

/**
 * Yanıtı oturumun önbelleğine yazar. İşaretsiz yanıt önbelleğe girmez; `yok` tüm sayfa
 * önbelleklerini siler; yeni oturum anahtarı eskilerini siler.
 */
async function storePage(key, res) {
  const session = res.headers.get(SESSION_HEADER);
  if (!session) return;
  if (session === NO_SESSION) {
    await signOut();
    return;
  }
  if ((await getSession()) !== session) {
    await setSession(session);
    await clearPageCaches(session);
  }
  if (res.status !== 200 || res.type !== "basic" || res.redirected) return;
  const cache = await caches.open(PAGE_CACHE_PREFIX + session);
  await cache.delete(key); // sıra yenilensin (en yeni sonda)
  await cache.put(key, res);
  lastStored.set(key, Date.now());
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k)),
  );
}

async function cachedPage(key) {
  const session = await getSession();
  if (!session) return undefined;
  const cache = await caches.open(PAGE_CACHE_PREFIX + session);
  return cache.match(key, { ignoreVary: true });
}

/* ---------------------------------------------------------------- iletiler */

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "varliklar" && Array.isArray(data.urls)) {
    event.waitUntil(cacheAssets(data.urls));
  } else if (data.type === "sayfa" && typeof data.url === "string") {
    event.waitUntil(cacheDocument(data.url));
  } else if (data.type === "temizle") {
    event.waitUntil(signOut());
  }
});

/** Sayfanın ilk yüklemede (service worker denetlemeden) aldığı statik dosyalar. */
async function cacheAssets(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.slice(0, 200).map(async (raw) => {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin || !isStaticAsset(url)) return;
      if (await cache.match(url.href, { ignoreVary: true })) return;
      try {
        const res = await fetch(url.href);
        if (res.ok && res.type === "basic" && !res.redirected) await cache.put(url.href, res);
      } catch {
        // ağ yok: sonraki açılışta yeniden denenir
      }
    }),
  );
}

/** Açık sayfanın belgesi (istemci tarafı gezinmede belge isteği olmaz): oturumla alınır. */
async function cacheDocument(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin || isBypassed(url) || isDataRequest(url)) return;
  const key = pageKey(url.href);
  const last = lastStored.get(key);
  if (last && Date.now() - last < PAGE_REFRESH_MS) return;
  lastStored.set(key, Date.now());
  try {
    const res = await fetch(url.href, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
      redirect: "follow",
    });
    if ((res.headers.get("content-type") || "").startsWith("text/html")) {
      await storePage(key, res);
    }
  } catch {
    lastStored.delete(key);
  }
}

/* ---------------------------------------------------------------- push */

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
