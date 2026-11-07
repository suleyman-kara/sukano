import { redirect } from "react-router";
import { assertSameOrigin, authFrom, callAuth, redirectWithCookies } from "~/lib/auth-api.server";
import type { Route } from "./+types/cikis";

/** Çıkış: POST /cikis → oturum kapatılır, `/giris`'e dönülür. */
export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { auth } = authFrom(context);
  const result = await callAuth(() =>
    auth.api.signOut({ headers: request.headers, returnHeaders: true }),
  );
  return result.ok ? redirectWithCookies("/giris", result.headers) : redirect("/giris");
}

/** GET ile gelinirse (bağlantı, yenileme) yalnızca girişe yönlendir. */
export function loader() {
  return redirect("/giris");
}
