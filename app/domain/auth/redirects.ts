/**
 * Yönlendirme kuralları: hangi yollar oturumsuz açılır, `next` parametresi
 * nereye gidebilir. Saf fonksiyonlar; kök middleware ve kimlik sayfaları kullanır.
 */

/** Kabuksuz kimlik sayfaları. Oturum varsa `/`'a (ya da `next`'e) yönlendirir. */
const AUTH_PAGES = ["/giris", "/kayit", "/dogrula", "/sifremi-unuttum", "/sifre-sifirla"];

/** Oturum istemeyen diğer yollar (önek eşleşmesi: kendisi ve alt yolları). */
const OTHER_PUBLIC = ["/cikis", "/health", "/api", "/__test"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Tek veri isteklerinde (`/ayarlar.data`, `/_root.data`) belge yolunu verir. */
export function stripDataSuffix(pathname: string): string {
  if (pathname === "/_root.data") return "/";
  return pathname.endsWith(".data") ? pathname.slice(0, -".data".length) : pathname;
}

export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGES.some((p) => matchesPrefix(pathname, p));
}

/** Oturumsuz açılabilen yollar. Geri kalan her yol oturum ister (varsayılan kapalı). */
export function isPublicPath(pathname: string): boolean {
  return isAuthPagePath(pathname) || OTHER_PUBLIC.some((p) => matchesPrefix(pathname, p));
}

/**
 * `next` için güvenli hedef: yalnızca site içi mutlak yol ("/…"). Başka kökene,
 * şemaya ya da kimlik/API yollarına giden değerler `fallback`'e döner.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return fallback;
  // Kontrol karakterleri (başlık enjeksiyonu) ve ters eğik çizgi (bazı tarayıcılar
  // "/" sayar) kabul edilmez.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, "http://sukano.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://sukano.invalid") return fallback;

  // Kodlanmış eğik çizgiyle başlayan yollar ("/%2F%2Fkotu") çözülünce "//" olur.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;

  const pathname = url.pathname;
  if (isAuthPagePath(pathname) || OTHER_PUBLIC.some((p) => matchesPrefix(pathname, p)))
    return fallback;
  return pathname + url.search + url.hash;
}

/** Oturumsuz kullanıcıyı gönderilecek giriş adresi; kök için `next` eklenmez. */
export function loginPathFor(next: string): string {
  const target = safeNext(next);
  return target === "/" ? "/giris" : `/giris?next=${encodeURIComponent(target)}`;
}
