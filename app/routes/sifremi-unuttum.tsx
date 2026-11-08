import { MailCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { data, Form } from "react-router";
import { AuthHeading, BackToLogin } from "~/components/auth/auth-layout";
import { FormMessage, SubmitButton, TextField } from "~/components/auth/fields";
import {
  TURNSTILE_FIELD,
  Turnstile,
  TurnstileNotice,
  type TurnstileHandle,
} from "~/components/auth/turnstile";
import { useFormValidation } from "~/components/auth/use-form-validation";
import { validateForgotForm } from "~/domain/auth/forms";
import { safeNext } from "~/domain/auth/redirects";
import { TURNSTILE_TEST_SITE_KEY } from "~/domain/auth/turnstile";
import { authFrom, authHeaders, callAuth, field } from "~/lib/auth-api.server";
import { getCloudflare } from "~/lib/context";
import type { Route } from "./+types/sifremi-unuttum";

export const meta: Route.MetaFunction = () => [{ title: "Şifreni sıfırla · Sukano" }];

type ActionData =
  | { sent: true; email: string }
  | { sent?: false; errors?: { email?: string }; formError?: string; email: string };

export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = getCloudflare(context);
  return {
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY,
    next: safeNext(new URL(request.url).searchParams.get("next")),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { auth } = authFrom(context);
  const form = await request.formData();
  const raw = field(form, "email");
  const parsed = validateForgotForm({ email: raw });
  if (!parsed.ok) return data<ActionData>({ errors: parsed.errors, email: raw }, { status: 400 });

  const { email } = parsed.value;
  const result = await callAuth(() =>
    auth.api.requestPasswordReset({
      body: { email, redirectTo: "/sifre-sifirla" },
      headers: authHeaders(request, field(form, TURNSTILE_FIELD)),
      returnHeaders: true,
    }),
  );
  if (!result.ok) {
    return data<ActionData>(
      { formError: result.message, email },
      { status: result.status === 429 ? 429 : 400 },
    );
  }
  // Adres kayıtlı olsun olmasın aynı yanıt (hesap varlığı sızdırılmaz).
  return data<ActionData>({ sent: true, email });
}

export default function SifremiUnuttum({ loaderData, actionData }: Route.ComponentProps) {
  const turnstile = useRef<TurnstileHandle>(null);
  const failed = actionData && !actionData.sent ? actionData : undefined;
  const { errors, onSubmit } = useFormValidation(
    (form) => validateForgotForm({ email: String(form.get("email") ?? "") }),
    failed?.errors,
    { waitForTurnstile: true },
  );

  useEffect(() => {
    if (failed) turnstile.current?.reset();
  }, [failed]);

  if (actionData?.sent) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-[18px] pb-10 md:pb-0 lg:gap-5">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <MailCheck className="size-7" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <AuthHeading title="E-postanı kontrol et">
          <strong className="font-semibold text-fg">{actionData.email}</strong> adresi kayıtlıysa
          bir sıfırlama bağlantısı gönderdik. Bağlantı 1 saat geçerlidir.
        </AuthHeading>
        <BackToLogin next={loaderData.next} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <AuthHeading title="Şifreni sıfırla">
        E-posta adresini yaz, sana bir sıfırlama bağlantısı gönderelim.
      </AuthHeading>
      <Form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <FormMessage>{failed?.formError}</FormMessage>
        <TextField
          label="E-posta"
          name="email"
          id="eposta"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ad@ornek.com"
          defaultValue={failed?.email}
          error={errors.email}
          required
        />
        <Turnstile siteKey={loaderData.turnstileSiteKey} ref={turnstile} />
        <SubmitButton pendingText="Gönderiliyor…">Sıfırlama bağlantısı gönder</SubmitButton>
        <TurnstileNotice />
      </Form>
      <BackToLogin next={loaderData.next} />
    </div>
  );
}
