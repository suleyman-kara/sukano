import { getAuth } from "~/lib/auth.server";
import { getCloudflare } from "~/lib/context";
import type { Route } from "./+types/api.auth.$";

/** Better Auth uçları: /api/auth/* (ör. /api/auth/ok, /api/auth/get-session). */
export function loader({ request, context }: Route.LoaderArgs) {
  return getAuth(getCloudflare(context).env).handler(request);
}

export function action({ request, context }: Route.ActionArgs) {
  return getAuth(getCloudflare(context).env).handler(request);
}
