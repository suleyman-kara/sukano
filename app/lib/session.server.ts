import { redirect, type RouterContextProvider } from "react-router";
import { isPublicPath, loginPathFor, safeNext, stripDataSuffix } from "~/domain/auth/redirects";
import { getAuth, type AuthSession } from "./auth.server";
import { getCloudflare } from "./context";

type Ctx = Readonly<RouterContextProvider>;

// Aynı istekte birden çok loader oturumu sorarsa D1'e bir kez gidilir.
const perRequest = new WeakMap<Request, Promise<AuthSession | null>>();

/** Geçerli oturumu (kullanıcı + oturum) döner; yoksa `null`. */
export function getSession(request: Request, context: Ctx): Promise<AuthSession | null> {
  let pending = perRequest.get(request);
  if (!pending) {
    const { env } = getCloudflare(context);
    pending = getAuth(env).api.getSession({ headers: request.headers });
    perRequest.set(request, pending);
  }
  return pending;
}

/** İsteğin belge yolu ve sorgusu (`.data` eki atılmış). */
function documentPath(request: Request): string {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.delete("_routes"); // tek veri isteklerinin iç parametresi
  const search = params.toString();
  return stripDataSuffix(url.pathname) + (search ? `?${search}` : "");
}

/**
 * Oturum zorunlu loader/action'lar için. Oturum yoksa `/giris?next=…` adresine
 * yönlendirir (fırlatır). Kök middleware zaten tüm uygulama yollarını korur; bu
 * yardımcı loader içinde kullanıcıya tipli erişim içindir.
 */
export async function requireUser(request: Request, context: Ctx) {
  const session = await getSession(request, context);
  if (!session) throw redirect(loginPathFor(documentPath(request)));
  return session;
}

/** Kimlik sayfaları: oturum varsa `next`'e (yoksa `/`) yönlendirir. */
export async function redirectIfSignedIn(request: Request, context: Ctx) {
  const session = await getSession(request, context);
  if (session) {
    throw redirect(safeNext(new URL(request.url).searchParams.get("next")));
  }
}

/**
 * Kök middleware'in koruması: herkese açık olmayan her yol oturum ister
 * (varsayılan kapalı). Yeni uygulama rotaları ek bir şey yapmadan korunur.
 */
export async function protectRoute(request: Request, context: Ctx) {
  const pathname = stripDataSuffix(new URL(request.url).pathname);
  if (isPublicPath(pathname)) return;
  await requireUser(request, context);
}

export type SessionUser = AuthSession["user"];
