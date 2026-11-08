import { data } from "react-router";
import {
  API_LIMIT_BINDINGS,
  API_RATE_LIMIT_MESSAGE,
  apiLimitKey,
  type ApiLimitAction,
} from "~/domain/security/api-limits";

/**
 * Kullanıcı başına hız sınırı (bkz. `app/domain/security/api-limits.ts`). Aşıldıysa 429 ve
 * Türkçe ileti içeren `{ ok: false, error }` yanıtı döner; geçerse `null`. Binding yoksa
 * (eski yapılandırma) geçer.
 */
export async function checkApiLimit(env: Env, action: ApiLimitAction, userId: string) {
  const limiter = env[API_LIMIT_BINDINGS[action]] as RateLimit | undefined;
  if (!limiter) return null;
  const { success } = await limiter.limit({ key: apiLimitKey(action, userId) });
  if (success) return null;
  return data(
    { ok: false as const, error: API_RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
