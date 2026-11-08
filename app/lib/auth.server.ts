import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { readVerificationToken, resetLink, verificationLink } from "~/domain/auth/links";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "~/domain/auth/rules";
import { createDb } from "~/db/client";
import { account, session, user, verification } from "~/db/schema";
import { enforceAuthPolicy } from "./auth-policy.server";
import {
  sendChangeEmailVerification,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "./email.server";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_HOUR = 60 * 60;

export function isGoogleEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Better Auth yapılandırması. Tablo alanları `app/db/schema.ts` ile uyumludur. */
export function createAuth(env: Env) {
  return betterAuth({
    appName: "Sukano",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [],
    database: drizzleAdapter(createDb(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    user: {
      additionalFields: {
        avatarColor: { type: "string", required: false, input: false },
      },
      // Yeni adrese doğrulama bağlantısı gider; tıklanana kadar eski adres geçerli.
      changeEmail: { enabled: true },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await sendResetPasswordEmail(env, {
          to: user.email,
          name: user.name,
          url: resetLink(url, token),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Doğrulanmamış hesapla giriş denenirse yeni bağlantı gönderilir.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: ONE_HOUR,
      sendVerificationEmail: async ({ user, url, token }) => {
        const link = verificationLink(url, token);
        const info = readVerificationToken(token);
        if (info?.requestType === "change-email-verification") {
          await sendChangeEmailVerification(env, { to: user.email, name: user.name, url: link });
        } else {
          await sendVerificationEmail(env, { to: user.email, name: user.name, url: link });
        }
      },
    },
    socialProviders: isGoogleEnabled(env)
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
    account: {
      // Aynı e-postayla Google ve şifreli giriş aynı hesaba bağlanır (PLAN §2).
      accountLinking: { enabled: true, trustedProviders: ["google", "email-password"] },
    },
    session: {
      expiresIn: THIRTY_DAYS,
      updateAge: 60 * 60 * 24,
    },
    // Better Auth'un yerleşik sınırlayıcısı isolate belleğinde sayar (Workers'ta
    // güvenilmez). Yerine Workers Rate Limiting binding'leri: `auth-policy.server.ts`.
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await enforceAuthPolicy(env, ctx);
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];

// Aynı isolate içinde `env` nesnesi sabittir; örneği yeniden kullan.
const cache = new WeakMap<Env, Auth>();

export function getAuth(env: Env): Auth {
  let auth = cache.get(env);
  if (!auth) {
    auth = createAuth(env);
    cache.set(env, auth);
  }
  return auth;
}
