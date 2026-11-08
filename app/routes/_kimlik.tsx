import { Outlet } from "react-router";
import { AuthLayout } from "~/components/auth/auth-layout";
import { redirectIfSignedIn } from "~/lib/session.server";
import type { Route } from "./+types/_kimlik";

/**
 * Kabuksuz kimlik sayfaları (giriş, kayıt, doğrulama, şifre sıfırlama).
 * Oturum açıksa `next`'e (yoksa `/`) yönlendirir.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  await redirectIfSignedIn(request, context);
  return null;
}

export default function KimlikDuzeni() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
