import { data, redirect } from "react-router";
import { LoginForm, type LoginActionData } from "~/components/auth/login-form";
import { validateLoginForm } from "~/domain/auth/forms";
import { safeNext } from "~/domain/auth/redirects";
import { authFrom, callAuth, field, redirectWithCookies } from "~/lib/auth-api.server";
import { isGoogleEnabled } from "~/lib/auth.server";
import { getCloudflare } from "~/lib/context";
import type { Route } from "./+types/giris";

export const meta: Route.MetaFunction = () => [
  { title: "Giriş yap · Sukano" },
  { name: "description", content: "Kişisel notların ve ekip projelerin, tek yerde." },
];

const NOTICES = {
  "sifre-guncellendi": { tone: "success", text: "Şifren güncellendi. Yeni şifrenle giriş yap." },
  "cikis-yapildi": { tone: "info", text: "Çıkış yaptın." },
  google: { tone: "error", text: "Google ile giriş tamamlanamadı. Lütfen tekrar dene." },
  "dogrulama-gecersiz": {
    tone: "error",
    text: "Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Giriş yapınca yeni bağlantı gönderilir.",
  },
} as const;

export function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const key = url.searchParams.get("durum") ?? (url.searchParams.get("error") ? "google" : null);
  return {
    googleEnabled: isGoogleEnabled(getCloudflare(context).env),
    next: safeNext(url.searchParams.get("next")),
    notice: key && key in NOTICES ? NOTICES[key as keyof typeof NOTICES] : null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env, auth } = authFrom(context);
  const form = await request.formData();
  const next = safeNext(field(form, "next"));

  if (field(form, "intent") === "google") {
    if (!isGoogleEnabled(env)) throw data("Google girişi kapalı", { status: 404 });
    const result = await callAuth(() =>
      auth.api.signInSocial({
        body: {
          provider: "google",
          callbackURL: next,
          errorCallbackURL: "/giris?durum=google",
          disableRedirect: true,
        },
        headers: request.headers,
        returnHeaders: true,
      }),
    );
    if (!result.ok || !result.data.url) return redirect("/giris?durum=google");
    return redirectWithCookies(result.data.url, result.headers);
  }

  const parsed = validateLoginForm({
    email: field(form, "email"),
    password: field(form, "password"),
  });
  if (!parsed.ok) {
    return data<LoginActionData>(
      { errors: parsed.errors, email: field(form, "email") },
      { status: 400 },
    );
  }
  const { email, password } = parsed.value;

  const result = await callAuth(() =>
    auth.api.signInEmail({
      body: { email, password, rememberMe: true, callbackURL: next },
      headers: request.headers,
      returnHeaders: true,
    }),
  );
  if (result.ok) return redirectWithCookies(next, result.headers);

  if (result.code === "EMAIL_NOT_VERIFIED") {
    // Better Auth (`sendOnSignIn`) yeni bir doğrulama bağlantısı gönderdi.
    const params = new URLSearchParams({ eposta: email, neden: "dogrulanmadi" });
    if (next !== "/") params.set("next", next);
    return redirect(`/dogrula?${params}`);
  }
  return data<LoginActionData>(
    { formError: result.message, email },
    { status: result.status === 429 ? 429 : 400 },
  );
}

export default function Giris({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <LoginForm
      googleEnabled={loaderData.googleEnabled}
      next={loaderData.next}
      notice={loaderData.notice}
      actionData={actionData}
    />
  );
}
