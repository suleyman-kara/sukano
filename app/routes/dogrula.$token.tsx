import { CircleAlert } from "lucide-react";
import { data } from "react-router";
import { AuthHeading, AuthLayout, BackToLogin } from "~/components/auth/auth-layout";
import { readVerificationToken } from "~/domain/auth/links";
import { safeNext } from "~/domain/auth/redirects";
import { authFrom, callAuth, redirectWithCookies } from "~/lib/auth-api.server";
import type { Route } from "./+types/dogrula.$token";

export const meta: Route.MetaFunction = () => [{ title: "E-posta doğrulama · Sukano" }];

/**
 * E-postadaki doğrulama bağlantısı: `/dogrula/:jeton[?next=]`.
 * - Kayıt doğrulaması: hesap doğrulanır, oturum açılır (Better Auth
 *   `autoSignInAfterVerification`), `next`'e (yoksa `/`) gidilir.
 * - E-posta değişikliği: yeni adres kaydedilir, Ayarlar'a dönülür.
 * Hata durumunda Türkçe açıklama gösterilir.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { auth } = authFrom(context);
  const token = params.token;
  const info = readVerificationToken(token);

  const result = await callAuth(() =>
    auth.api.verifyEmail({ query: { token }, headers: request.headers, returnHeaders: true }),
  );
  if (result.ok) {
    const target =
      info?.requestType === "change-email-verification"
        ? "/ayarlar?durum=eposta-degisti#hesap"
        : safeNext(new URL(request.url).searchParams.get("next"));
    return redirectWithCookies(target, result.headers);
  }
  return data(
    {
      message:
        result.code === "TOKEN_EXPIRED"
          ? "Bağlantının süresi dolmuş. Giriş yapmayı dene; hesabın doğrulanmamışsa yeni bir bağlantı gönderilir."
          : "Bağlantı geçersiz ya da daha önce kullanılmış. Giriş yapmayı dene; hesabın doğrulanmamışsa yeni bir bağlantı gönderilir.",
    },
    { status: 400 },
  );
}

export default function DogrulaJeton({ loaderData }: Route.ComponentProps) {
  return (
    <AuthLayout>
      <div className="flex flex-1 flex-col justify-center gap-[18px] pb-10 md:pb-0 lg:gap-5">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <CircleAlert className="size-7" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <AuthHeading title="E-posta doğrulanamadı">{loaderData.message}</AuthHeading>
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
