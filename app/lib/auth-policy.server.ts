/**
 * Better Auth uçlarına uygulanan ek kurallar (`hooks.before`): hız sınırı,
 * Turnstile ve kayıtta var olan e-posta denetimi. Kurallar Better Auth
 * katmanında olduğu için hem sayfa action'larından yapılan sunucu çağrıları hem
 * de doğrudan `/api/auth/*` istekleri aynı denetimden geçer.
 */
import { APIError } from "better-auth/api";
import { authErrorMessage } from "~/domain/auth/errors";
import { clientIp, rateLimitKeys } from "~/domain/auth/rate-limit";
import { normalizeEmail } from "~/domain/auth/rules";
import {
  TURNSTILE_TEST_SECRET_PASS,
  TURNSTILE_TEST_SITE_KEY,
  turnstileTestKeyOutcome,
} from "~/domain/auth/turnstile";

/** Turnstile jetonunun sunucuya taşındığı başlık (Better Auth captcha eklentisiyle aynı ad). */
export const CAPTCHA_HEADER = "x-captcha-response";

/** Turnstile ile korunan uçlar. */
const CAPTCHA_PATHS = new Set(["/sign-up/email", "/request-password-reset"]);

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function turnstileSecret(env: Env): string {
  if (env.TURNSTILE_SECRET_KEY) return env.TURNSTILE_SECRET_KEY;
  // Gizli anahtar yoksa yalnızca test site anahtarıyla eşleşen test gizli anahtarı
  // kullanılır; gerçek site anahtarıyla yapılandırılmış ortamda istek reddedilir.
  return (env.TURNSTILE_SITE_KEY as string) === TURNSTILE_TEST_SITE_KEY
    ? TURNSTILE_TEST_SECRET_PASS
    : "";
}

/** Turnstile jetonunu doğrular. Boş jeton her zaman reddedilir. */
export async function verifyTurnstile(
  env: Env,
  token: string | null | undefined,
  ip: string,
): Promise<boolean> {
  if (!token) return false;
  const secret = turnstileSecret(env);
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY tanımlı değil; istek reddedildi.");
    return false;
  }
  const testOutcome = turnstileTestKeyOutcome(secret, token);
  if (testOutcome !== null) return testOutcome;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip !== "bilinmiyor") body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("[turnstile] siteverify isteği başarısız:", error);
    return false;
  }
}

/** Sayaçlardan biri aşıldıysa `false`. Binding yoksa (ör. eski yapılandırma) geçer. */
export async function checkRateLimit(
  env: Env,
  path: string,
  headers: Headers | undefined,
  email: string | undefined,
): Promise<boolean> {
  for (const check of rateLimitKeys(path, { ip: clientIp(headers), email })) {
    const limiter = check.limiter === "ip" ? env.AUTH_IP_LIMITER : env.AUTH_EMAIL_LIMITER;
    if (!limiter) continue;
    const { success } = await limiter.limit({ key: check.key });
    if (!success) return false;
  }
  return true;
}

function apiError(
  status: "TOO_MANY_REQUESTS" | "BAD_REQUEST" | "UNPROCESSABLE_ENTITY",
  code: string,
) {
  return new APIError(status, { code, message: authErrorMessage(code) });
}

type HookContext = {
  path: string;
  body?: unknown;
  headers?: Headers;
  context: {
    internalAdapter: { findUserByEmail(email: string): Promise<unknown> };
  };
};

/** `hooks.before` gövdesi. Kural ihlalinde `APIError` fırlatır. */
export async function enforceAuthPolicy(env: Env, ctx: HookContext): Promise<void> {
  const body = (ctx.body ?? {}) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email : undefined;

  if (!(await checkRateLimit(env, ctx.path, ctx.headers, email))) {
    throw apiError("TOO_MANY_REQUESTS", "TOO_MANY_REQUESTS");
  }

  if (CAPTCHA_PATHS.has(ctx.path)) {
    const token = ctx.headers?.get(CAPTCHA_HEADER);
    if (!(await verifyTurnstile(env, token, clientIp(ctx.headers)))) {
      throw apiError("BAD_REQUEST", "CAPTCHA_FAILED");
    }
  }

  // Better Auth, doğrulama zorunluyken var olan adrese kayıtta sessizce başarı
  // döner. Ürün kararı açık hata vermek (kayıt Turnstile ve hız sınırıyla korunur).
  if (ctx.path === "/sign-up/email" && email) {
    if (await ctx.context.internalAdapter.findUserByEmail(normalizeEmail(email))) {
      throw apiError("UNPROCESSABLE_ENTITY", "USER_ALREADY_EXISTS");
    }
  }
}
