import { createContext, type RouterContextProvider } from "react-router";

/** Worker'ın `env` ve `ctx` değerleri; `workers/app.ts` her istekte doldurur. */
export type CloudflareContext = {
  env: Env;
  ctx: ExecutionContext;
};

export const cloudflareContext = createContext<CloudflareContext>();

/** Loader/action/middleware içinde: `const { env } = getCloudflare(context)`. */
export function getCloudflare(context: Readonly<RouterContextProvider>): CloudflareContext {
  return context.get(cloudflareContext);
}
