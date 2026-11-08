/**
 * Güvenlik başlıkları (PLAN §6). Saf: `workers/app.ts` her yanıta uygular, birim testli.
 *
 * - **CSP (HTML):** nonce tabanlı. React Router'ın satır içi hidrasyon betikleri, tema
 *   betiği ve `<ScrollRestoration>` her istekte üretilen nonce'u taşır; `'strict-dynamic'`
 *   sayesinde bu betiklerin `import()` ile yüklediği rota parçaları ve Turnstile betiği de
 *   çalışır. Nonce'suz satır içi betik ve `on*` öznitelikleri engellenir. Stiller için
 *   `'unsafe-inline'` bilerek açık: React `style` öznitelikleri, Radix / Motion / sonner
 *   satır içi stil yazar (stil enjeksiyonu betik çalıştırmaz; bilinen ödünleşim).
 * - **connect-src:** uygulamanın kendi kökeni ve aynı sunucunun WebSocket'i (`ws:` / `wss:`;
 *   Safari `'self'` ile WebSocket'i eşleştirmediği için açıkça yazılır), Turnstile.
 * - **JSON yanıtlar:** `default-src 'none'` (yanıt belge olarak açılsa da hiçbir şey yüklenmez).
 * - Yanıtın kendi CSP'si varsa (ör. ek indirme rotasının `sandbox`'ı) dokunulmaz.
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const GOOGLE_ACCOUNTS_ORIGIN = "https://accounts.google.com";
/** Google ile girişte profil fotoğrafı bu alanlardan gelir. */
export const GOOGLE_AVATAR_SOURCE = "https://*.googleusercontent.com";

/** HSTS: iki yıl, alt alan adlarıyla. Yalnızca HTTPS yanıtlarda gönderilir. */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

/** Uygulamanın kullanmadığı güçlü tarayıcı özellikleri kapalı. */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

export const JSON_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Kriptografik olarak rastgele, base64 nonce (128 bit). */
export function createNonce(
  bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** HTML belgeleri için CSP. `origin`: isteğin kökeni (`https://sukano.app`). */
export function documentCsp({ nonce, origin }: { nonce: string; origin: string }): string {
  const url = new URL(origin);
  const secure = url.protocol === "https:";
  const ws = `${secure ? "wss" : "ws"}://${url.host}`;
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", `'nonce-${nonce}'`, "'strict-dynamic'", "'self'", TURNSTILE_ORIGIN],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", GOOGLE_AVATAR_SOURCE],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ws, TURNSTILE_ORIGIN],
    ["media-src", "'self'", "blob:"],
    ["frame-src", TURNSTILE_ORIGIN],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'", GOOGLE_ACCOUNTS_ORIGIN],
    ["frame-ancestors", "'none'"],
  ];
  if (secure) directives.push(["upgrade-insecure-requests"]);
  return directives.map((d) => d.join(" ")).join("; ");
}

type HeaderOptions = {
  /** İsteğin adresi (HSTS ve CSP kökeni için). */
  url: string;
  /** HTML belgesinde kullanılan nonce; yoksa belge CSP'si yazılmaz (geliştirme sunucusu). */
  nonce?: string;
};

/**
 * Yanıta eklenecek başlıklar. Var olan başlıkların üzerine yazmaz (rotanın daha sıkı
 * kararı geçerli kalır); bu yüzden `[ad, değer]` listesi döner, uygulayan karar verir.
 */
export function securityHeaders(
  contentType: string | null,
  { url, nonce }: HeaderOptions,
): [string, string][] {
  const { protocol, origin } = new URL(url);
  const type = (contentType ?? "").toLowerCase();
  const out: [string, string][] = [
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["X-Frame-Options", "DENY"],
    ["Permissions-Policy", PERMISSIONS_POLICY],
    ["Cross-Origin-Opener-Policy", "same-origin"],
  ];
  if (protocol === "https:") out.push(["Strict-Transport-Security", HSTS_VALUE]);
  if (type.startsWith("text/html")) {
    if (nonce) out.push(["Content-Security-Policy", documentCsp({ nonce, origin })]);
  } else if (type.startsWith("application/json") || type.startsWith("text/x-script")) {
    // JSON ve React Router tek veri yanıtları (`.data`, `text/x-script`).
    out.push(["Content-Security-Policy", JSON_CSP]);
  }
  return out;
}

/** Durumu değiştiren yöntemler (CSRF denetimi). */
export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/**
 * Başka kökenden gelen durum değiştiren istek mi (CSRF, derinlemesine savunma). Tarayıcılar
 * POST / PUT / DELETE isteklerinde `Origin` gönderir; yoksa `Sec-Fetch-Site`'a bakılır.
 * İkisi de yoksa (tarayıcı dışı istemci) geçer: oturum çerezi zaten `SameSite=Lax`.
 */
export function isCrossOriginWrite(request: {
  method: string;
  url: string;
  headers: Headers;
}): boolean {
  if (!isUnsafeMethod(request.method)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin !== new URL(request.url).origin;
  if (origin === "null") return true;
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site";
}
