/**
 * Kimlik dışı uçların hız sınırları (PLAN §6). Sayaçlar Workers Rate Limiting binding'lerinde
 * (`wrangler.jsonc` → `ratelimits`), anahtar kullanıcı başınadır. Kimlik uçlarının sınırları:
 * `app/domain/auth/rate-limit.ts`.
 *
 * | Eylem            | Binding          | Sınır             |
 * | ---------------- | ---------------- | ----------------- |
 * | Dosya yükleme    | `UPLOAD_LIMITER` | dakikada 30       |
 * | Davet gönderme   | `INVITE_LIMITER` | dakikada 20       |
 * | Push aboneliği   | `PUSH_LIMITER`   | dakikada 10       |
 */

export type ApiLimitAction = "yukleme" | "davet" | "push";

export const API_LIMIT_BINDINGS = {
  yukleme: "UPLOAD_LIMITER",
  davet: "INVITE_LIMITER",
  push: "PUSH_LIMITER",
} as const satisfies Record<ApiLimitAction, string>;

export const API_RATE_LIMIT_MESSAGE =
  "Çok fazla istek gönderdin. Lütfen bir dakika sonra tekrar dene.";

export function apiLimitKey(action: ApiLimitAction, userId: string): string {
  return `${action}:kullanici:${userId}`;
}
