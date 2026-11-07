import { normalizeEmail } from "./rules";

/**
 * Hız sınırı anahtarları (PLAN §6). Sayaçlar Cloudflare Workers Rate Limiting
 * binding'lerinde tutulur (`AUTH_IP_LIMITER`, `AUTH_EMAIL_LIMITER`; bkz.
 * `wrangler.jsonc`). Burada yalnızca hangi isteğin hangi anahtarla sayılacağı
 * belirlenir.
 */

/** Better Auth uç yolu → anahtarlardaki kısa eylem adı. */
const ACTIONS = {
  "/sign-in/email": "giris",
  "/sign-up/email": "kayit",
  "/request-password-reset": "sifirlama",
  "/send-verification-email": "dogrulama",
} as const;

export type RateLimitedPath = keyof typeof ACTIONS;
export const RATE_LIMITED_PATHS = Object.keys(ACTIONS) as RateLimitedPath[];

export type RateLimitCheck = { limiter: "ip" | "email"; key: string };

export const RATE_LIMIT_MESSAGE = "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene.";

/** Bir istek için denetlenecek sayaçlar: her zaman IP, e-posta varsa e-posta. */
export function rateLimitKeys(
  path: string,
  { ip, email }: { ip: string; email: string | undefined },
): RateLimitCheck[] {
  const action = ACTIONS[path as RateLimitedPath];
  if (!action) return [];
  const checks: RateLimitCheck[] = [{ limiter: "ip", key: `${action}:ip:${ip}` }];
  const normalized = email ? normalizeEmail(email) : "";
  if (normalized) checks.push({ limiter: "email", key: `${action}:eposta:${normalized}` });
  return checks;
}

/**
 * İstemci IP'si: Cloudflare önünde `CF-Connecting-IP` her zaman doludur; yerelde
 * `X-Forwarded-For`'a düşülür.
 */
export function clientIp(headers: Headers | undefined): string {
  const cf = headers?.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "bilinmiyor";
}
