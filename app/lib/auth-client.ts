import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./auth.server";

/** Tarayıcı tarafı Better Auth istemcisi (aynı köken, `/api/auth`). */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
