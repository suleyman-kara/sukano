import { safeNext } from "./redirects";

/**
 * E-postalardaki bağlantılar. Better Auth kendi `/api/auth/...` adresini üretir;
 * kullanıcıyı Türkçe sayfalarımıza göndermek için aynı kökenle (Better Auth'un
 * `baseURL`'i, yani `BETTER_AUTH_URL`) sayfa adresine çevrilir.
 */

/** `/dogrula/:jeton[?next=]`. Better Auth'un `callbackURL`'i güvenliyse `next` olur. */
export function verificationLink(betterAuthUrl: string, token: string): string {
  const url = new URL(betterAuthUrl);
  const next = safeNext(url.searchParams.get("callbackURL"));
  const target = new URL(`/dogrula/${encodeURIComponent(token)}`, url.origin);
  if (next !== "/") target.searchParams.set("next", next);
  return target.toString();
}

/** `/sifre-sifirla?token=…`. */
export function resetLink(betterAuthUrl: string, token: string): string {
  const target = new URL("/sifre-sifirla", new URL(betterAuthUrl).origin);
  target.searchParams.set("token", token);
  return target.toString();
}

export type VerificationTokenInfo = {
  email: string;
  updateTo?: string;
  requestType?: string;
};

/**
 * Doğrulama jetonunun (JWT) yükünü okur; imza denetlenmez. Yalnızca arayüz
 * kararları için (e-posta değişikliği mi, hata ekranında hangi adres).
 * Doğrulamanın kendisi Better Auth'ta yapılır.
 */
export function readVerificationToken(token: string): VerificationTokenInfo | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Record<string, unknown>;
    if (typeof payload.email !== "string") return null;
    const info: VerificationTokenInfo = { email: payload.email };
    if (typeof payload.updateTo === "string") info.updateTo = payload.updateTo;
    if (typeof payload.requestType === "string") info.requestType = payload.requestType;
    return info;
  } catch {
    return null;
  }
}
