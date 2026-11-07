import { data, redirect } from "react-router";
import { RegisterForm, type RegisterActionData } from "~/components/auth/register-form";
import { TURNSTILE_FIELD } from "~/components/auth/turnstile";
import { validateRegisterForm } from "~/domain/auth/forms";
import { safeNext } from "~/domain/auth/redirects";
import { TURNSTILE_TEST_SITE_KEY } from "~/domain/auth/turnstile";
import { authFrom, authHeaders, callAuth, field } from "~/lib/auth-api.server";
import { isGoogleEnabled } from "~/lib/auth.server";
import { getCloudflare } from "~/lib/context";
import type { Route } from "./+types/kayit";

export const meta: Route.MetaFunction = () => [
  { title: "Kayıt ol · Sukano" },
  { name: "description", content: "Ücretsiz Sukano hesabı aç." },
];

export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = getCloudflare(context);
  return {
    googleEnabled: isGoogleEnabled(env),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY,
    next: safeNext(new URL(request.url).searchParams.get("next")),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { auth } = authFrom(context);
  const form = await request.formData();
  const next = safeNext(field(form, "next"));
  const values = { name: field(form, "name"), email: field(form, "email") };

  const parsed = validateRegisterForm({ ...values, password: field(form, "password") });
  if (!parsed.ok) {
    return data<RegisterActionData>({ errors: parsed.errors, values }, { status: 400 });
  }
  const { name, email, password } = parsed.value;

  const result = await callAuth(() =>
    auth.api.signUpEmail({
      body: { name, email, password, callbackURL: next },
      headers: authHeaders(request, field(form, TURNSTILE_FIELD)),
      returnHeaders: true,
    }),
  );
  if (!result.ok) {
    const fieldError =
      result.code === "USER_ALREADY_EXISTS" || result.code === "INVALID_EMAIL"
        ? { email: result.message }
        : result.code.startsWith("PASSWORD_")
          ? { password: result.message }
          : null;
    return data<RegisterActionData>(
      fieldError ? { errors: fieldError, values } : { formError: result.message, values },
      { status: result.status === 429 ? 429 : 400 },
    );
  }

  const params = new URLSearchParams({ eposta: email });
  if (next !== "/") params.set("next", next);
  return redirect(`/dogrula?${params}`);
}

export default function Kayit({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <RegisterForm
      googleEnabled={loaderData.googleEnabled}
      turnstileSiteKey={loaderData.turnstileSiteKey}
      next={loaderData.next}
      actionData={actionData}
    />
  );
}
