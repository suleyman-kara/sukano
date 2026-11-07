import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "~/db/client";
import { account, session, user, verification } from "~/db/schema";
import { sendResetPasswordEmail, sendVerificationEmail } from "./email.server";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Better Auth yapılandırması. Tablo alanları `app/db/schema.ts` ile uyumludur. */
export function createAuth(env: Env) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

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
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(env, { to: user.email, name: user.name, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(env, { to: user.email, name: user.name, url });
      },
    },
    socialProviders: googleEnabled
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
