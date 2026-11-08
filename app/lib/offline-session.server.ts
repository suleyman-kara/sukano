import type { RouterContextProvider } from "react-router";
import { OFFLINE_SESSION_HEADER, NO_SESSION, sessionCacheKey } from "~/domain/pwa/offline";
import { stripDataSuffix } from "~/domain/auth/redirects";
import { getSession } from "./session.server";

/**
 * Service worker'ın çevrimdışı önbelleği için oturum işareti (bkz. `public/sw.js`). Belge ve
 * tek veri (`.data`) yanıtlarına `X-Sukano-Oturum` yazılır: oturumdan türetilmiş, geri
 * çevrilemez kısa anahtar ya da `yok`. Service worker sayfaları bu anahtarla ayrı önbelleğe
 * koyar, anahtar değişince ya da `yok` görünce eski oturumun önbelleğini siler: çıkış, hesap
 * silme ve başka kullanıcıyla giriş önbelleği temizler; bir oturumun sayfası başka oturuma
 * gösterilmez. API, `/health` ve `/__test/*` yanıtları işaretlenmez (önbelleğe alınmaz).
 */
export async function markOfflineSession(
  request: Request,
  context: Readonly<RouterContextProvider>,
  response: Response,
): Promise<Response> {
  if (!isPageRequest(new URL(request.url).pathname)) return response;
  const session = await getSession(request, context).catch(() => null);
  const value = session ? await sessionCacheKey(session.session.id) : NO_SESSION;
  try {
    response.headers.set(OFFLINE_SESSION_HEADER, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(OFFLINE_SESSION_HEADER, value);
    return copy;
  }
}

function isPageRequest(pathname: string): boolean {
  const path = stripDataSuffix(pathname);
  return !/^\/(api|__test|health|cdn-cgi)(\/|$)/.test(path);
}
