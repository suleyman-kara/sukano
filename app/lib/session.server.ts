import { redirect, type RouterContextProvider } from "react-router";
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

/**
 * Oturum zorunlu loader/action'lar için. Oturum yoksa `/giris?next=…` adresine
 * yönlendirir (fırlatır).
 */
export async function requireUser(request: Request, context: Ctx) {
  const session = await getSession(request, context);
  if (!session) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(next && next !== "/" ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  }
  return session;
}

export type SessionUser = AuthSession["user"];
