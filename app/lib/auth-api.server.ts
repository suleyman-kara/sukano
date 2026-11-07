/**
 * Sayfa action/loader'larından Better Auth'u sunucu tarafında çağırmak için
 * yardımcılar: hata kodlarını Türkçe metne çevirir, `Set-Cookie` başlıklarını
 * yönlendirmeye taşır.
 */
import { isAPIError } from "better-auth/api";
import { redirect, type RouterContextProvider } from "react-router";
import { authErrorMessage } from "~/domain/auth/errors";
import { CAPTCHA_HEADER } from "./auth-policy.server";
import { getAuth } from "./auth.server";
import { getCloudflare } from "./context";

export type AuthFailure = { ok: false; code: string; message: string; status: number };
export type AuthSuccess<T> = { ok: true; data: T; headers: Headers };

/**
 * `auth.api.*({ …, returnHeaders: true })` çağrısını sarar. Beklenen hatalar
 * (`APIError`) sonuç olarak döner; diğerleri fırlatılır.
 */
export async function callAuth<T>(
  call: () => Promise<{ headers: Headers; response: T }>,
): Promise<AuthSuccess<T> | AuthFailure> {
  try {
    const { headers, response } = await call();
    return { ok: true, data: response, headers };
  } catch (error) {
    if (isAPIError(error)) {
      const body = (error.body ?? {}) as { code?: string };
      const code = body.code ?? "UNKNOWN";
      return { ok: false, code, message: authErrorMessage(code), status: error.statusCode };
    }
    throw error;
  }
}

/** Yalnızca `Set-Cookie` başlıklarını kopyalar (yönlendirme yanıtı için). */
export function cookieHeaders(source: Headers | undefined): Headers {
  const headers = new Headers();
  for (const cookie of source?.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
  return headers;
}

/** Better Auth çerezleriyle birlikte yönlendirir. */
export function redirectWithCookies(to: string, source: Headers | undefined) {
  return redirect(to, { headers: cookieHeaders(source) });
}

/** İstek başlıkları + (varsa) Turnstile jetonu. */
export function authHeaders(request: Request, captchaToken?: string | null): Headers {
  const headers = new Headers(request.headers);
  if (captchaToken !== undefined) headers.set(CAPTCHA_HEADER, captchaToken ?? "");
  return headers;
}

export function authFrom(context: Readonly<RouterContextProvider>) {
  const { env } = getCloudflare(context);
  return { env, auth: getAuth(env) };
}

/**
 * Durum değiştiren action'lar için köken denetimi. Better Auth çerezleri
 * `SameSite=Lax` olduğundan siteler arası POST çerez taşımaz; bu ek bir katmandır.
 * `Origin` başlığı yoksa (eski istemciler) geçer.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new Response("Geçersiz köken", { status: 403 });
  }
}

/** FormData'dan metin alanı (yoksa boş dize). */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
